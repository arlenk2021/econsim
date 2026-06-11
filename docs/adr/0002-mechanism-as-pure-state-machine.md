# ADR-0002: Mechanisms are pure state machines

**Status:** Accepted · **Date:** 2026-06

## Context
We need the same auction logic to (a) run live with 200 humans, (b) run
10,000 headless rounds overnight for LLM experiments, and (c) be provably
correct — a payoff bug in a classroom destroys trust instantly.

## Decision
Every mechanism implements a pure interface:

```ts
init(config, rng)                       → S
validate(state, playerId, action)      → Ok | Rejection   // with reasons
apply(state, playerId, action)         → { state, events }
onTimer(state, timerId)                → { state, events }
view(state, playerId | Spectator)      → PlayerView        // information sets
payoffs(state)                         → Map<Id, number>   // terminal only
```

No I/O, no clocks, no ambient randomness (seeded RNG injected). The
`view()` function encodes information sets: sealed bids never leave the
server because each player only ever receives their own view.

## Consequences
- (+) Replays = `(config, seed, action_log)` — tiny, deterministic; replay
  determinism is a CI test.
- (+) Property tests are tractable: budget balance, conservation
  (Σ payments = 0 in double auction), Vickrey second-price + truthfulness
  dominance across 10k random valuation profiles.
- (+) Identical code live / headless / in-browser sandbox.
- (−) Continuous-time markets must be approximated by discrete ticks (fine
  for v1; CDA gets its own ADR if/when).
- (−) Discipline tax: any contributor sneaking a Date.now() into a mechanism
  breaks replay CI — which is the point.
