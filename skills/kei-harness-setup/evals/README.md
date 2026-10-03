# kei-harness-setup evals

Eval cases for the harness setup skill.

## Running

```bash
node scripts/run-evals.mjs --skill kei-harness-setup --harness opencode \
  --model ray/deepseek-ai/DeepSeek-V4-Flash \
  --out evals-out/kei-harness-setup-deepseek-$(date +%F) --jobs 2
```

## Results

| Config | Pass rate | Errors |
| --- | --- | --- |
| with_skill | 44% (4/9) | 0 |
| without_skill | 11% (1/9) | 0 |

See `results/2026-10-02-opencode-deepseek-v4-flash/` for detailed outputs.
