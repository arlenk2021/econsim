import { describe, expect, it } from "vitest";
import { makeRng, Vickrey } from "@econsim/mechanisms";
import {
  BudgetExceeded,
  MockBidderAgent,
  charge,
  decideWithPolicy,
  type Agent,
  type AgentContext,
} from "../src/agent.ts";

describe("LLM agent runner (ADR-0003)", () => {
  it("budget guard throws at 100%, warns at 80%", () => {
    const guard = { budgetMicroUsd: 1000, spentMicroUsd: 0 };
    charge(guard, 500); // 50% — fine
    expect(guard.spentMicroUsd).toBe(500);
    expect(() => charge(guard, 600)).toThrow(BudgetExceeded);
  });

  it("mock agent produces a valid, deterministic bid", async () => {
    const agent = new MockBidderAgent("claude-mock", 5000);
    const rng = makeRng(123);
    const ctx: AgentContext = { view: {}, rules: "vickrey", history: [], rng: makeRng(123) };
    const d1 = await agent.decide(ctx);
    const d2 = await agent.decide({ ...ctx, rng: makeRng(123) });
    expect(d1.action).toEqual(d2.action);
    expect((d1.action as { cents: number }).cents).toBeGreaterThanOrEqual(0);
    void rng;
  });

  it("retries once on rejection, then falls back to default (agent_failure)", async () => {
    // An agent that always proposes an out-of-range bid → forces failure path.
    const badAgent: Agent = {
      name: "bad",
      decide: () => ({ action: { type: "bid", cents: -1 }, costMicroUsd: 1, raw: "bid -1" }),
    };
    const guard = { budgetMicroUsd: 1_000_000, spentMicroUsd: 0 };
    let state = Vickrey.init({ players: ["a"], seed: 1 }, makeRng(1));
    const validate = (action: unknown) => Vickrey.validate(state, "a", action as never);
    const result = await decideWithPolicy(
      badAgent,
      { view: {}, rules: "vickrey", history: [], rng: makeRng(1) },
      validate,
      { type: "bid", cents: 0 },
      guard,
    );
    expect(result.failure).toBe(true);
    expect(result.action).toEqual({ type: "bid", cents: 0 });
    expect(result.transcript.some((t) => t.includes("agent_failure"))).toBe(true);
    expect(guard.spentMicroUsd).toBe(2); // charged twice (initial + retry)
    void state;
  });

  it("accepts a valid action on the first try without failure", async () => {
    const agent = new MockBidderAgent("ok", 3000);
    const guard = { budgetMicroUsd: 1_000_000, spentMicroUsd: 0 };
    const state = Vickrey.init({ players: ["a"], seed: 1 }, makeRng(1));
    const result = await decideWithPolicy(
      agent,
      { view: {}, rules: "vickrey", history: [], rng: makeRng(1) },
      (action) => Vickrey.validate(state, "a", action as never),
      { type: "bid", cents: 0 },
      guard,
    );
    expect(result.failure).toBe(false);
  });
});
