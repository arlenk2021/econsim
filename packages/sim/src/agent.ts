import type { SeededRng } from "@econsim/mechanisms";

/**
 * Cost-governed LLM agent runner (ADR-0003). Interface + a mock agent so the
 * full loop is testable without spending tokens. A real agent swaps in
 * `callModel` with an API client; the contract below is what the runner relies
 * on.
 *
 * Agents see EXACTLY the PlayerView a human seat would (passed in `view`), the
 * public rules, and their own history — nothing else. Actions are
 * JSON-schema-shaped; an invalid action gets ONE retry with the reason, then a
 * default action, logged as an `agent_failure`.
 */

export interface AgentContext {
  /** The information-set view the seat would see (from mechanism.view). */
  view: unknown;
  /** Public, human-readable rules of the game. */
  rules: string;
  /** This agent's own past (action, reward) pairs. */
  history: Array<{ action: unknown; rewardCents: number }>;
  /** Seeded RNG for any agent-side randomness (keeps replays deterministic). */
  rng: SeededRng;
}

export interface AgentDecision {
  action: unknown;
  /** Estimated cost of this call, in micro-USD (1e-6 USD). */
  costMicroUsd: number;
  /** Raw text the model produced (for the transcript). */
  raw: string;
}

export interface Agent {
  readonly name: string;
  decide(ctx: AgentContext): Promise<AgentDecision> | AgentDecision;
}

export interface BudgetGuard {
  budgetMicroUsd: number;
  spentMicroUsd: number;
}

export class BudgetExceeded extends Error {}

/** Charge a call against the budget; warn at 80%, throw at 100% (ADR-0003). */
export function charge(guard: BudgetGuard, costMicroUsd: number): void {
  guard.spentMicroUsd += costMicroUsd;
  const frac = guard.spentMicroUsd / guard.budgetMicroUsd;
  if (frac >= 1) {
    throw new BudgetExceeded(
      `budget exhausted: spent ${guard.spentMicroUsd} of ${guard.budgetMicroUsd} micro-USD`,
    );
  }
  if (frac >= 0.8) {
    console.warn(
      `[budget] ${(frac * 100).toFixed(0)}% of budget used (${guard.spentMicroUsd}/${guard.budgetMicroUsd} micro-USD)`,
    );
  }
}

/**
 * Mock "echo" bidder: deterministically derives a bid from its view + RNG.
 * Stands in for a real model so the agent loop is exercised in tests.
 */
export class MockBidderAgent implements Agent {
  constructor(
    readonly name: string,
    private readonly valuationCents: number,
    private readonly shade = 1.0,
  ) {}

  decide(ctx: AgentContext): AgentDecision {
    // tiny deterministic "noise" so transcripts vary but replays are stable
    const noise = Math.floor(ctx.rng.next() * 100) - 50;
    const cents = Math.max(0, Math.round(this.valuationCents * this.shade) + noise);
    return {
      action: { type: "bid", cents },
      costMicroUsd: 1500, // pretend a frontier call cost ~$0.0015
      raw: `I value this at ${this.valuationCents}¢; I bid ${cents}¢.`,
    };
  }
}

/**
 * Run one agent decision with the ADR-0003 retry/default policy.
 * `validate` is the mechanism validator; `defaultAction` is used after a failed
 * retry. Returns the chosen action and whether a failure was logged.
 */
export async function decideWithPolicy(
  agent: Agent,
  ctx: AgentContext,
  validate: (action: unknown) => { ok: true } | { ok: false; reason: string },
  defaultAction: unknown,
  guard: BudgetGuard,
): Promise<{ action: unknown; failure: boolean; transcript: string[] }> {
  const transcript: string[] = [];
  let decision = await agent.decide(ctx);
  charge(guard, decision.costMicroUsd);
  transcript.push(decision.raw);
  let check = validate(decision.action);
  if (check.ok) return { action: decision.action, failure: false, transcript };

  // ONE retry with the rejection reason injected into the view.
  const retryCtx: AgentContext = {
    ...ctx,
    rules: `${ctx.rules}\n\nYour last action was rejected: ${check.reason}. Try again.`,
  };
  decision = await agent.decide(retryCtx);
  charge(guard, decision.costMicroUsd);
  transcript.push(decision.raw);
  check = validate(decision.action);
  if (check.ok) return { action: decision.action, failure: false, transcript };

  // default action; log as agent_failure.
  transcript.push(`[agent_failure] using default action after retry`);
  return { action: defaultAction, failure: true, transcript };
}
