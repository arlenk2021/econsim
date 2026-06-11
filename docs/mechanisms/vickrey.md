# Vickrey (second-price sealed-bid) auction

## Theory
- **Rules:** one item; sealed bids; highest bid wins; winner pays the
  second-highest bid.
- **Key result:** truthful bidding (bid = private value) is a weakly dominant
  strategy (Vickrey 1961). No equilibrium computation needed — dominance.
- **Prediction overlay shown in-game:** winner's payoff = v₁ − b₂; revenue
  = second-highest valuation under truthful play.
- **What humans actually do:** overbidding is the classic lab finding —
  which is exactly what the live theory-vs-actual chart makes visible.

## Implementation notes
- State machine: `collecting → revealed → settled`.
- **Tie-breaking:** equal high bids → uniform random among tied winners using
  the injected seed; the loser's bid is still the "second price." Documented
  here because ties are where naive implementations silently diverge.
- Numerical: integer cents only. No floats in payoffs, ever.
- `view()` during `collecting`: a player sees only their own bid and the
  count of bids placed. Reveal order is seeded-shuffled.

## Invariants (test/vickrey.properties.ts)
- I1: winner = argmax(bids), modulo seeded tie-break.
- I2: payment = max(bids \ {winner's bid}).
- I3: For 10k random valuation profiles and arbitrary opponent strategies,
  truthful bidding's payoff ≥ any deviation's payoff (weak dominance).
- I4: Σ transfers: winner pays exactly what the seller account receives.
- I5: replay(config, seed, log) reproduces terminal state bit-for-bit.

## Edge cases
- Single bidder → pays reserve (config; default 0).
- No bids → no allocation; all payoffs 0.
- Late join during `collecting` → spectator (per room policy).
