# 🎲 econsim.gg

**Run live auctions and market games with your class, your friends — or a
room full of LLM agents. Watch theory meet reality in real time.**

[Live demo room](#) · [Instructor guide](docs/classroom/instructor-guide.md) ·
[Mechanism library](packages/mechanisms) · [Experiments](experiments)

<!-- demo.gif: 30 humans in a double auction, price converging on the
     competitive-equilibrium line -->

## What is this?

Spin up a room → pick a mechanism (Vickrey, double auction, public goods,
all-pay) → share a 5-letter join code → up to 200 players bid from their
phones, no accounts needed. Live charts overlay the **theoretical
prediction** on what your humans actually do.

Then the fun part: **drop GPT and Claude into the same games.**

## Findings

| Experiment | Status |
|---|---|
| Do LLMs tacitly collude in repeated first-price auctions? | 🔬 [preregistered](experiments/_template) |
| LLM free-riding in public goods games vs. human baselines | planned |

## The engineering

- **Mechanisms are pure state machines** — `(state, action) → (state', events)`,
  no I/O, seeded randomness only. Same code runs on the live server, in
  10k-round headless simulations, and in the browser.
  ([ADR-0002](docs/adr/0002-mechanism-as-pure-state-machine.md))
- **Property-tested economics** — money conservation, Vickrey truthfulness
  dominance, replay determinism: enforced in CI, not asserted in prose.
- **Authoritative server, information-set views** — sealed bids stay sealed
  because hidden state never leaves the server.
- **Cost-governed LLM experiment runner** — preregistered protocols, pinned
  prompts, hard budget ceilings, full transcripts.

## Quickstart

```bash
pnpm install && pnpm dev     # web :3000, room server :4000
pnpm sim vickrey --players 100 --rounds 1000   # headless, same mechanism code
```

## Add a mechanism in one file

Implement the `Mechanism<S, A, C>` interface, add property tests for your
payoff invariants, write `docs/mechanisms/<name>.md` pairing the theory with
the implementation. See [CONTRIBUTING.md](CONTRIBUTING.md).
