/**
 * Public goods invariants. fast-check, 10k cases.
 * docs/mechanisms/public-goods.md.
 */
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { PublicGoods, PG_BANK, type PGConfig, type PGState } from "../src/index.js";

const RUNS = 10_000;

function run(
  contributions: number[],
  endowmentCents: number,
  mNum: number,
  mDen: number,
  seed: number,
): PGState {
  const players = contributions.map((_, i) => `p${i}`);
  const config: PGConfig = {
    players,
    endowmentCents,
    multiplierNum: mNum,
    multiplierDen: mDen,
    seed,
  };
  let state = PublicGoods.init(config, undefined as never);
  contributions.forEach((c, i) => {
    state = PublicGoods.apply(state, players[i]!, {
      type: "contribute",
      cents: Math.min(c, endowmentCents),
    }).state;
  });
  return PublicGoods.apply(state, PG_BANK, { type: "settle" }).state;
}

const seedArb = fc.integer({ min: 0, max: 2 ** 31 - 1 });

const scenarioArb = fc
  .record({
    endowment: fc.integer({ min: 1, max: 100_00 }),
    mNum: fc.integer({ min: 2, max: 8 }),
    seed: seedArb,
  })
  .chain(({ endowment, mNum, seed }) =>
    fc.record({
      endowment: fc.constant(endowment),
      mNum: fc.constant(mNum),
      seed: fc.constant(seed),
      contributions: fc.array(fc.integer({ min: 0, max: endowment }), {
        minLength: 1,
        maxLength: 8,
      }),
    }),
  );

describe("public goods invariants", () => {
  it("P1: money conservation — Σ (players + bank) payoffs == 0, integer cents", () => {
    fc.assert(
      fc.property(scenarioArb, ({ endowment, mNum, seed, contributions }) => {
        const state = run(contributions, endowment, mNum, 1, seed);
        const payoffs = PublicGoods.payoffs(state);
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

  it("P2: free-riding dominance — given others fixed, contributing 0 maximizes own payoff when multiplier < n", () => {
    const focalArb = fc
      .record({
        endowment: fc.integer({ min: 1, max: 100_00 }),
        n: fc.integer({ min: 2, max: 8 }),
        seed: seedArb,
      })
      .chain(({ endowment, n, seed }) =>
        fc.record({
          endowment: fc.constant(endowment),
          seed: fc.constant(seed),
          // multiplier strictly less than n keeps it a social dilemma
          mNum: fc.integer({ min: 1, max: Math.max(1, n - 1) }),
          ownContribution: fc.integer({ min: 0, max: endowment }),
          others: fc.array(fc.integer({ min: 0, max: endowment }), {
            minLength: n - 1,
            maxLength: n - 1,
          }),
        }),
      );
    fc.assert(
      fc.property(
        focalArb,
        ({ endowment, seed, mNum, ownContribution, others }) => {
          const payoffOf = (own: number): number => {
            const state = run([own, ...others], endowment, mNum, 1, seed);
            return PublicGoods.payoffs(state).get("p0")!;
          };
          // contributing nothing weakly dominates contributing something
          expect(payoffOf(0)).toBeGreaterThanOrEqual(payoffOf(ownContribution));
        },
      ),
      { numRuns: RUNS },
    );
  });

  it("P3: social efficiency — when multiplier > 1, full contribution maximizes group total", () => {
    fc.assert(
      fc.property(
        fc.record({
          endowment: fc.integer({ min: 1, max: 1_00 }),
          n: fc.integer({ min: 2, max: 6 }),
          mNum: fc.integer({ min: 2, max: 5 }),
          seed: seedArb,
        }),
        ({ endowment, n, mNum, seed }) => {
          const groupTotal = (each: number): number => {
            const state = run(
              Array(n).fill(each),
              endowment,
              mNum,
              1,
              seed,
            );
            const payoffs = PublicGoods.payoffs(state);
            let s = 0;
            for (let i = 0; i < n; i++) s += payoffs.get(`p${i}`)!;
            return s; // excludes bank: real welfare created among players
          };
          expect(groupTotal(endowment)).toBeGreaterThanOrEqual(groupTotal(0));
        },
      ),
      { numRuns: RUNS },
    );
  });

  it("P4: replay determinism, bit-for-bit", () => {
    fc.assert(
      fc.property(scenarioArb, ({ endowment, mNum, seed, contributions }) => {
        const a = run(contributions, endowment, mNum, 1, seed);
        const b = run(contributions, endowment, mNum, 1, seed);
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      }),
      { numRuns: RUNS },
    );
  });
});
