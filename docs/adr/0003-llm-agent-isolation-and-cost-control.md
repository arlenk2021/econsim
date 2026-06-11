# ADR-0003: LLM agents face the same validator humans do, under a hard budget

**Status:** Accepted · **Date:** 2026-06

## Context
LLM experiments must be (a) fair — agents can't access hidden state humans
can't see; (b) reproducible; (c) financially bounded — a runaway loop on a
frontier API is a real failure mode.

## Decision
- Agents receive exactly the `PlayerView` a human in that seat would see,
  serialized, plus the public game rules and their own history. Nothing else.
- Actions are JSON-schema-constrained; invalid actions get ONE retry with the
  rejection reason, then a default action — logged as a first-class
  `agent_failure` event (failures are findings, not noise).
- Every experiment declares `budget_usd`; the runner warns at 80%, kills at
  100%. Per-round token/cost telemetry is written into the replay.
- Prompts are versioned and hashed into the experiment record; temperature
  and (where supported) seeds pinned.

## Consequences
- (+) "The agents played the same game the humans did" is literally true and
  auditable — methodological dunk-resistance.
- (+) Worst-case spend is known before pressing go.
- (−) One-retry policy means some games end on default actions; the analysis
  must report agent_failure rates alongside headline results. Always.
