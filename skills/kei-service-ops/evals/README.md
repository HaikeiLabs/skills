# kei-service-ops evals

Eval cases for the service operations skill.

## Files

- `evals.json` — eval cases used by `scripts/run-evals.mjs`
- `results/` — benchmark results (committed after each run)

## Running

```bash
node scripts/run-evals.mjs --skill kei-service-ops --harness opencode \
  --model ray/deepseek-ai/DeepSeek-V4-Flash \
  --out evals-out/kei-service-ops-deepseek-$(date +%F) --jobs 2
```

## Results

| Config | Pass rate | Errors |
| --- | --- | --- |
| with_skill | 86% (12/14) | 0 |
| without_skill | 40% (2/5) | 4 |

See `results/2026-10-05-opencode-deepseek-v4-flash/` for detailed outputs.

## Adding eval cases

1. Add a new object to the `evals` array in `evals.json`
2. Use the next integer `id`
3. Include `prompt`, `expected_output`, and `expectations` (array of strings)
4. Verify with `node scripts/verify-evals.mjs`
