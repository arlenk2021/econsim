/**
 * Double auction (call market) invariants. fast-check, 10k cases.
 * docs/mechanisms/double-auction.md.
 */
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { DoubleAuction, type DAConfig, type DAState } from "../src/index.js";

const RUNS = 10_000;

function run(
  buyerBids: number[],
  sellerAsks: number[],
  seed: number,
): DAState {
  const buyers = buyerBids.map((_, i) => `b${i}`);
  const sellers = sellerAsks.map((_, i) => `s${i}`);
  const config: DAConfig = { buyers, sellers, seed };
  let state = DoubleAuction.init(config, undefined as never);
  buyerBids.forEach((p, i) => {
    state = DoubleAuction.apply(state, buyers[i]!, {
      type: "order",
      priceCents: p,
    }).state;
  });
  sellerAsks.forEach((p, i) => {
    state = DoubleAuction.apply(state, sellers[i]!, {
      type: "order",
      priceCents: p,
    }).state;
  });
  return DoubleAuction.apply(state, "__market__", { type: "clear" }).state;
}

const priceArb = fc.integer({ min: 0, max: 1_000_00 });
const sideArb = fc.array(priceArb, { minLength: 0, maxLength: 6 });
const seedArb = fc.integer({ min: 0, max: 2 ** 31 - 1 });

describe("double auction invariants", () => {
  it("D1: money conservation — Σ transfers == 0 in integer cents", () => {
    fc.assert(
      fc.property(sideArb, sideArb, seedArb, (buys, sells, seed) => {
        const state = run(buys, sells, seed);
        const payoffs = DoubleAuction.payoffs(state);
        let sum = 0;
        for (const [, c] of payoffs) {
          expect(Number.isInteger(c)).toBe(true);
          sum += c;
        }
        expect(sum).toBe(0);
      }),
      { numRuns: RUNS },
    );
  });

  it("D2: equal matched counts — every matched buyer pairs a matched seller", () => {
    fc.assert(
      fc.property(sideArb, sideArb, seedArb, (buys, sells, seed) => {
        const state = run(buys, sells, seed);
        const payoffs = DoubleAuction.payoffs(state);
        const buyersMatched = [...payoffs].filter(
          ([id, c]) => id.startsWith("b") && c !== 0,
        ).length;
        const sellersMatched = [...payoffs].filter(
          ([id, c]) => id.startsWith("s") && c !== 0,
        ).length;
        expect(buyersMatched).toBe(sellersMatched);
      }),
      { numRuns: RUNS },
    );
  });

  it("D3: individual rationality — matched buyer pays <= its bid, seller gets >= its ask", () => {
    fc.assert(
      fc.property(sideArb, sideArb, seedArb, (buys, sells, seed) => {
        const state = run(buys, sells, seed);
        if (state.clearingPriceCents === null) return;
        const price = state.clearingPriceCents;
        for (const id of state.matched) {
          const order = state.orders[id]!;
          if (order.side === "buy") {
            expect(price).toBeLessThanOrEqual(order.priceCents);
          } else {
            expect(price).toBeGreaterThanOrEqual(order.priceCents);
          }
        }
      }),
      { numRuns: RUNS },
    );
  });

  it("D4: replay determinism, bit-for-bit", () => {
    fc.assert(
      fc.property(sideArb, sideArb, seedArb, (buys, sells, seed) => {
        const a = run(buys, sells, seed);
        const b = run(buys, sells, seed);
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      }),
      { numRuns: RUNS },
    );
  });
});
