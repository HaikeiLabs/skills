# kei-harness-policy evals

Eval cases for the harness command policy skill.

## Running

```bash
node scripts/run-evals.mjs --skill kei-harness-policy --harness opencode \
  --model ray/deepseek-ai/DeepSeek-V4-Flash --jobs 2
```

## Results

| Config | Pass rate | Errors |
| --- | --- | --- |
| with_skill | 64% (16/25) | 0 |
| without_skill | 0% (0/25) | 0 |

See `results/2026-10-01-opencode-deepseek-v4-flash/` for detailed outputs.
