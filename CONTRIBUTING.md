# Contributing

## Setup
```bash
pnpm install && pnpm dev      # web + room server
pnpm test                     # incl. mechanism property suites
```

## Adding a mechanism (the contribution we want most)
1. One file in `packages/mechanisms/src/` implementing `Mechanism<S,A,C>`.
   Pure. Seeded RNG only. Integer cents. Hidden state never in `view()`.
2. Property tests for YOUR payoff invariants — minimum: conservation +
   replay determinism + one mechanism-specific economic property.
3. `docs/mechanisms/<name>.md`: theory (predictions!) + implementation
   notes + tie-breaking + edge cases. The Vickrey doc is the template.

## Running an experiment
Copy `experiments/_template/`, fill `protocol.md`, **commit it before
collecting any data** (the git timestamp is the preregistration), then run.
PRs with results but no pre-committed protocol are declined on principle.
