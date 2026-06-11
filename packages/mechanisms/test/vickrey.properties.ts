/**
 * Executable economics. Invariants I1–I5 from docs/mechanisms/vickrey.md.
 * fast-check, 10k cases each. These tests ARE the correctness claim the
 * README makes — keep them honest.
 */
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  Vickrey,
  VICKREY_SELLER,
  type VickreyConfig,
  type VickreyState,
} from "../src/index.js";

const RUNS = 10_000;

/** Run a full sealed-bid Vickrey auction from a profile of bids (cents). */
function runVickrey(
  bids: number[],
  seed: number,
  reserveCents = 0,
): { state: VickreyState; players: string[] } {
  const players = bids.map((_, i) => `p${i}`);
  const config: VickreyConfig = { players, reserveCents, seed };
  let state = Vickrey.init(config, Vickrey.rngFor({ seed } as VickreyState));
  bids.forEach((cents, i) => {
    state = Vickrey.apply(state, players[i]!, { type: "bid", cents }).state;
  });
  state = Vickrey.apply(state, VICKREY_SELLER, { type: "reveal" }).state;
  return { state, players };
}

const bidProfile = fc.array(fc.integer({ min: 0, max: 1_000_00 }), {
  minLength: 1,
  maxLength: 8,
});
const seedArb = fc.integer({ min: 0, max: 2 ** 31 - 1 });

describe("vickrey invariants", () => {
  it("I1: winner is argmax of bids (seeded tie-break)", () => {
    fc.assert(
      fc.property(bidProfile, seedArb, (bids, seed) => {
        const { state, players } = runVickrey(bids, seed);
        const maxBid = Math.max(...bids);
        if (maxBid <= 0 && (state.reserveCents ?? 0) === 0) {
          // all-zero bids still allocate (maxBid >= reserve 0); winner is a
          // top bidder.
        }
        expect(state.winner).not.toBeNull();
        const winnerIdx = players.indexOf(state.winner!);
        // winner's own bid must equal the max bid (argmax modulo tie-break)
        expect(bids[winnerIdx]).toBe(maxBid);
      }),
      { numRuns: RUNS },
    );
  });

  it("I2: payment equals second-highest bid", () => {
    fc.assert(
      fc.property(bidProfile, seedArb, (bids, seed) => {
        const { state, players } = runVickrey(bids, seed);
        const winnerIdx = players.indexOf(state.winner!);
        const others = bids.filter((_, i) => i !== winnerIdx);
        const secondHighest = others.length ? Math.max(...others) : 0;
        expect(state.paymentCents).toBe(secondHighest);
      }),
      { numRuns: RUNS },
    );
  });

  it("I3: truthful bidding weakly dominates (random profiles × strategies)", () => {
    // For a focal player with valuation v facing arbitrary opponent bids, the
    // surplus from bidding truthfully (b = v) is >= surplus from any deviation.
    // Surplus = (v - payment) if you win, else 0.
    const focalArb = fc.record({
      v: fc.integer({ min: 0, max: 1_000_00 }),
      deviation: fc.integer({ min: 0, max: 1_000_00 }),
      opponents: fc.array(fc.integer({ min: 0, max: 1_000_00 }), {
        minLength: 0,
        maxLength: 7,
      }),
      seed: seedArb,
    });
    fc.assert(
      fc.property(focalArb, ({ v, deviation, opponents, seed }) => {
        const surplus = (focalBid: number): number => {
          const bids = [focalBid, ...opponents];
          const { state, players } = runVickrey(bids, seed);
          const won = state.winner === players[0];
          return won ? v - state.paymentCents : 0;
        };
        const truthful = surplus(v);
        const deviated = surplus(deviation);
        expect(truthful).toBeGreaterThanOrEqual(deviated);
      }),
      { numRuns: RUNS },
    );
  });

  it("I4: transfer conservation, integer cents", () => {
    fc.assert(
      fc.property(
        bidProfile,
        seedArb,
        fc.integer({ min: 0, max: 50_00 }),
        (bids, seed, reserve) => {
          const { state } = runVickrey(bids, seed, reserve);
          const payoffs = Vickrey.payoffs(state);
          let sum = 0;
          for (const [, cents] of payoffs) {
            expect(Number.isInteger(cents)).toBe(true);
            sum += cents;
          }
          // winner pays exactly what the seller receives → net zero.
          expect(sum).toBe(0);
          if (state.winner !== null) {
            expect(payoffs.get(VICKREY_SELLER)).toBe(state.paymentCents);
            expect(payoffs.get(state.winner)).toBe(-state.paymentCents);
          }
        },
      ),
      { numRuns: RUNS },
    );
  });

  it("I5: replay determinism, bit-for-bit", () => {
    fc.assert(
      fc.property(bidProfile, seedArb, (bids, seed) => {
        const a = runVickrey(bids, seed);
        const b = runVickrey(bids, seed);
        expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
      }),
      { numRuns: RUNS },
    );
  });
});
