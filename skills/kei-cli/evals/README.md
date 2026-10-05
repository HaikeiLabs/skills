# kei-cli evals

Eval cases for the kei CLI skill.

## Running

```bash
node scripts/run-evals.mjs --skill kei-cli --harness opencode \
  --model ray/deepseek-ai/DeepSeek-V4-Flash \
  --out evals-out/kei-cli-deepseek-$(date +%F) --jobs 2
```

## Results

### 2026-10-05 (added troubleshooting evals 6–8)

| Config | Pass rate | Errors |
| --- | --- | --- |
| with_skill | 75% (15/20) | 0 |
| without_skill | 40% (2/5) | 6 |

The new login troubleshooting evals (6–8) all passed 3/3 with the skill.
without_skill had 6 incomplete runs (permission rejections in the opencode
harness), so the 40% figure is based on only 2 completed evaluations.

See `results/2026-10-05-opencode-deepseek-v4-flash/` for detailed outputs.

### 2026-10-02 (baseline)

| Config | Pass rate | Errors |
| --- | --- | --- |
| with_skill | 73% (8/11) | 0 |
| without_skill | 22% (2/9) | 1 |

See `results/2026-10-02-opencode-deepseek-v4-flash/` for detailed outputs.
