/**
 * All-pay auction invariants. fast-check, 10k cases.
 * docs/mechanisms/all-pay.md.
 */
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { AllPay, ALLPAY_SELLER, type AllPayConfig, type AllPayState } from "../src/index.js";

const RUNS = 10_000;

function run(bids: number[], seed: number): { state: AllPayState; players: string[] } {
  const players = bids.map((_, i) => `p${i}`);
  const config: AllPayConfig = { players, seed };
  let state = AllPay.init(config, undefined as never);
  bids.forEach((c, i) => {
    state = AllPay.apply(state, players[i]!, { type: "bid", cents: c }).state;
  });
  state = AllPay.apply(state, ALLPAY_SELLER, { type: "reveal" }).state;
  return { state, players };
}

const bidProfile = fc.array(fc.integer({ min: 0, max: 1_000_00 }), {
  minLength: 1,
  maxLength: 8,
});
const seedArb = fc.integer({ min: 0, max: 2 ** 31 - 1 });

describe("all-pay invariants", () => {
  it("A1: everyone pays their own bid; seller receives the sum", () => {
    fc.assert(
      fc.property(bidProfile, seedArb, (bids, seed) => {
        const { state, players } = run(bids, seed);
        const payoffs = AllPay.payoffs(state);
        players.forEach((p, i) => {
          expect(payoffs.get(p)).toBe(-bids[i]!);
        });
        const total = bids.reduce((a, b) => a + b, 0);
        expect(payoffs.get(ALLPAY_SELLER)).toBe(total);
      }),
      { numRuns: RUNS },
    );
  });

  it("A2: money conservation — Σ payoffs == 0, integer cents", () => {
    fc.assert(
      fc.property(bidProfile, seedArb, (bids, seed) => {
        const { state } = run(bids, seed);
        let sum = 0;
        for (const [, c] of AllPay.payoffs(state)) {
          expect(Number.isInteger(c)).toBe(true);
          sum += c;
        }
        expect(sum).toBe(0);
      }),
      { numRuns: RUNS },
    );
  });

  it("A3: winner is a top bidder (argmax, seeded tie-break) when any positive bid exists", () => {
    fc.assert(
      fc.property(bidProfile, seedArb, (bids, seed) => {
        const { state, players } = run(bids, seed);
        const maxBid = Math.max(...bids);
        if (maxBid <= 0) {
          expect(state.winner).toBeNull();
        } else {
          const idx = players.indexOf(state.winner!);
          expect(bids[idx]).toBe(maxBid);
        }
      }),
      { numRuns: RUNS },
    );
  });

  it("A4: replay determinism, bit-for-bit", () => {
    fc.assert(
      fc.property(bidProfile, seedArb, (bids, seed) => {
        const a = run(bids, seed);
        const b = run(bids, seed);
        expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
      }),
      { numRuns: RUNS },
    );
  });
});
