# Double auction (sealed call market)

## Theory
- **Rules:** buyers submit a max willingness-to-pay, sellers a min acceptable
  price; one unit each. A single **uniform clearing price** matches the largest
  set of mutually agreeable trades.
- **Key result:** with truthful reporting the call market is allocatively
  efficient — every gain-from-trade where some buyer values the unit above some
  seller's cost is realized; price converges to the competitive equilibrium.
- **Prediction overlay shown in-game:** the competitive-equilibrium price (where
  the sorted demand and supply curves cross) and the maximum gains-from-trade.
- **What humans actually do:** prices oscillate toward CE over repeated rounds
  (Smith 1962) — the live chart shows convergence.

## Implementation notes
- State machine: `collecting → cleared`.
- Clearing: sort buyer bids descending, seller asks ascending; the trade
  quantity `q` is the largest index where `buy[q] >= sell[q]`. Uniform price is
  `round((marginal_buy + marginal_sell) / 2)`, which lies in `[marginal_sell,
  marginal_buy]` so every matched trader is individually rational.
- **Tie-breaking:** orders at the same price are ordered by a seeded shuffle of
  player ids, so which marginal trader clears is reproducible.
- Numerical: integer cents only; the midpoint is rounded.
- `view()` during `collecting`: a player sees only their own order and the count
  of orders placed.

## Invariants (test/double-auction.properties.ts)
- D1: Σ transfers == 0 (matched buyers pay exactly what matched sellers receive).
- D2: matched buyers count == matched sellers count.
- D3: individual rationality — matched buyer pays ≤ its bid, matched seller
  receives ≥ its ask.
- D4: replay(config, seed, log) reproduces terminal state bit-for-bit.

## Edge cases
- No crossing orders → no trade; clearing price `null`; all payoffs 0.
- Single buyer + single seller with `bid >= ask` → trade at the midpoint.
- Ties at the margin → seeded tie-break decides which trader clears.
