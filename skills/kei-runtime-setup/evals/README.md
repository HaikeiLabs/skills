# kei-runtime-setup evals

Eval cases for the runtime setup skill.

## Running

```bash
node scripts/run-evals.mjs --skill kei-runtime-setup --harness opencode \
  --model ray/deepseek-ai/DeepSeek-V4-Flash \
  --out evals-out/kei-runtime-setup-deepseek-$(date +%F) --jobs 2
```

## Results

| Config | Pass rate | Errors |
| --- | --- | --- |
| with_skill | 90% (9/10) | 0 |
| without_skill | 20% (2/10) | 0 |

See `results/2026-10-02-opencode-deepseek-v4-flash/` for detailed outputs.
