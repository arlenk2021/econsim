# Experiment protocol: Do LLM agents overbid in Vickrey auctions like humans do?
**Status: PREREGISTERED — committed before any data collection.**

## Hypothesis
In repeated sealed-bid second-price (Vickrey) auctions, LLM agents' bids exceed
their assigned private values (the classic human lab over-bidding finding,
Kagel & Levin 1993), despite truthful bidding being weakly dominant. We expect
mean bid / value > 1 with the confidence interval excluding 1.

## Design
- Mechanism + config (committed JSON, hash: `317b3d9cca6a4b3e`):
  `{ "mechanism": "vickrey", "players": 8, "rounds": 200, "maxValueCents": 10000, "seed": 20260610 }`
- Models & versions: `gpt-x (pinned)`, `claude-y (pinned)` — exact ids recorded
  in `results/run-meta.json` at execution time.
- Prompt version hash: `TBD-at-run` · temperature `0.7` · seeds pinned where
  supported. Each seat receives ONLY its `view(state, seat)` plus the public
  rules and its own (bid, payoff) history (ADR-0003).
- n rounds: **200** · matchups: same-model (8×same), cross-model (4+4), and
  mixed-with-baseline (4 LLM + 4 truthful bots).
- Budget ceiling: **$5.00** (runner enforces; warns at 80%, kills at 100%).

## Analysis plan (decided NOW, not after seeing data)
- Primary metric: mean (bid / value) with bootstrap 95% CIs (10k resamples).
  Reject the null (no over-bidding) if the CI lower bound > 1.
- Secondary: efficiency (item to highest-value seat) and truthfulness regret
  (cents left on the table vs. truthful play) per the headless runner's stats.
- Robustness: ≥3 prompt paraphrases; report `agent_failure` rates always
  (default actions on retry-failure are findings, not noise).
- We will report the result regardless of direction.

## Outputs
`results/` raw replays + transcripts (each replay re-simulates bit-for-bit via
`pnpm test:replays`-style verification) · `analysis.ipynb` · `writeup.md`.

## Reproduce
```bash
# Baseline (bots, no API cost) — establishes the truthful reference:
pnpm sim vickrey --players 8 --rounds 200 --strategy truthful --seed 20260610
# Over-bidding bot sanity check (should show positive regret, <100% efficiency):
pnpm sim vickrey --players 8 --rounds 200 --strategy overbid --seed 20260610
```
