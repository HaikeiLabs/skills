# CONNECTOR_NAME evals

This directory holds eval cases for the CONNECTOR_NAME skill.

## Files

- `evals.json` — eval cases used by `scripts/run-evals.mjs`
- `results/` — benchmark results (committed after each run)

## Running

```bash
node scripts/run-evals.mjs --skill CONNECTOR_NAME --harness opencode \
  --model ray/deepseek-ai/DeepSeek-V4-Flash \
  --out evals-out/CONNECTOR_NAME-deepseek-$(date +%F) --jobs 2
```

## Adding eval cases

1. Add a new object to the `evals` array in `evals.json`
2. Use the next integer `id`
3. Include `prompt`, `expected_output`, and `expectations` (array of strings)
4. Verify with `node scripts/verify-evals.mjs`
