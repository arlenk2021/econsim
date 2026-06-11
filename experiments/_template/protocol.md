# Experiment protocol: <title>
**Status: PREREGISTERED — committed before any data collection.**

## Hypothesis
e.g. In repeated first-price auctions, LLM agents' winning bids stabilize
above the competitive-equilibrium prediction (tacit collusion signature).

## Design
- Mechanism + config (committed JSON, hash: `...`)
- Models & versions: e.g. gpt-x (pinned), claude-y (pinned)
- Prompt version hash · temperature · seeds where supported
- n rounds: ___ · matchups: same-model / cross-model / mixed-with-baseline
- Budget ceiling: $___ (runner enforces; see ADR-0003)

## Analysis plan (decided NOW, not after seeing data)
- Primary metric: mean winning bid / CE benchmark, with bootstrap CIs
- Robustness: ≥3 prompt paraphrases; report agent_failure rates always
- We will report the result regardless of direction.

## Outputs
`results/` raw replays+transcripts · `analysis.ipynb` · `writeup.md`
