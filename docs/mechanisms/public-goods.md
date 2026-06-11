# Public goods game (linear, single round)

## Theory
- **Rules:** each of `n` players gets an endowment and secretly contributes
  `c_i ∈ [0, endowment]` to a common pool. The pool is multiplied by a factor
  `m` (with `1 < m < n`) and split equally: each player receives `m·Σc / n`.
- **Key result:** contributing nothing is the **dominant strategy** for an
  individual (you keep your dollar and still get a share of everyone else's),
  yet full contribution maximizes **group welfare** — the canonical social
  dilemma. Nash prediction: zero contribution. Social optimum: full.
- **Prediction overlay shown in-game:** the Nash (free-ride) line at 0 and the
  social-optimum welfare line; the chart shows where real play falls between.
- **What humans actually do:** partial cooperation that decays over repeated
  rounds (Fehr & Gächter) — visible live.

## Implementation notes
- State machine: `collecting → settled`.
- Multiplier is a rational `multiplierNum / multiplierDen` so arithmetic stays
  integer-exact. Public return per player = `floor(floor(m·Σc) / n)`.
- **Conservation accounting:** players pay `Σc` into the pool and receive
  `perPlayer·n` back. A `__bank__` account absorbs the net (the money the
  multiplier creates, plus the floor remainder), so the sum over *all* accounts
  is exactly 0 in integer cents.
- `view()` during `collecting`: a player sees only their own contribution and
  the count placed.

## Invariants (test/public-goods.properties.ts)
- P1: Σ (players + bank) payoffs == 0, integer cents.
- P2: with `m < n`, contributing 0 weakly dominates any positive contribution
  for a player holding others fixed.
- P3: with `m > 1`, full contribution by everyone maximizes group welfare.
- P4: replay determinism, bit-for-bit.

## Edge cases
- All contribute 0 → everyone keeps their endowment; payoffs 0 (net).
- Floor remainder of `m·Σc / n` is burned to the bank (kept out of payouts) so
  no fractional cents are ever paid.
