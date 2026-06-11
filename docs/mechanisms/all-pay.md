# All-pay auction (sealed-bid)

## Theory
- **Rules:** one item; sealed bids; highest bid wins; **every** bidder pays
  their own bid, win or lose. Models lobbying, R&D races, war-of-attrition.
- **Key result:** there is no dominant strategy. In the symmetric equilibrium
  with `n` bidders and values uniform on `[0, v̄]`, a bidder of value `v` bids
  `b(v) = v · (n−1)/n · (v/v̄)^{n−1}` — strictly below value (shading). Expected
  revenue equals that of the first- and second-price auctions (revenue
  equivalence), but realized revenue can exceed the highest single value because
  losers pay too.
- **Prediction overlay shown in-game:** the equilibrium bid function and
  expected revenue; the live chart shows over-/under-dissipation.
- **What humans actually do:** over-dissipation (aggregate bids exceed the prize)
  is the classic contest-experiment finding.

## Implementation notes
- State machine: `collecting → settled`.
- Winner = argmax of bids; ties broken by a seeded uniform draw among the top
  bidders. The seller receives the **sum of all bids**.
- Numerical: integer cents only.
- `view()` during `collecting`: a player sees only their own bid and the count.

## Invariants (test/all-pay.properties.ts)
- A1: every bidder's payoff == −(their own bid); seller receives Σ bids.
- A2: Σ payoffs == 0, integer cents (conservation).
- A3: the winner is a top bidder (argmax, seeded tie-break) whenever any
  positive bid exists.
- A4: replay determinism, bit-for-bit.

## Edge cases
- All-zero bids → no winner; everyone pays 0.
- Tie at the top → seeded tie-break picks the winner; both still paid their bid.
