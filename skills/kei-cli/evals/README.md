# kei-cli evals

Eval cases for the kei CLI skill.

## Running

```bash
node scripts/run-evals.mjs --skill kei-cli --harness opencode \
  --model ray/deepseek-ai/DeepSeek-V4-Flash \
  --out evals-out/kei-cli-deepseek-$(date +%F) --jobs 2
```

## Results

| Config | Pass rate | Errors |
| --- | --- | --- |
| with_skill | 73% (8/11) | 0 |
| without_skill | 22% (2/9) | 1 |

See `results/2026-10-02-opencode-deepseek-v4-flash/` for detailed outputs.
