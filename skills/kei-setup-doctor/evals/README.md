# kei-setup-doctor evals

Eval cases for the setup doctor skill.

## Running

```bash
node scripts/run-evals.mjs --skill kei-setup-doctor --harness opencode \
  --model ray/deepseek-ai/DeepSeek-V4-Flash \
  --out evals-out/kei-setup-doctor-deepseek-$(date +%F) --jobs 2
```

## Results

| Config | Pass rate | Errors |
| --- | --- | --- |
| with_skill | 71% (15/21) | 0 |
| without_skill | 13% (2/16) | 2 |

See `results/2026-10-02-opencode-deepseek-v4-flash/` for detailed outputs.
