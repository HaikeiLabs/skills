# kei-harness-setup evals

Eval cases for the harness setup skill.

## Running

```bash
node scripts/run-evals.mjs --skill kei-harness-setup --harness opencode \
  --model ray/deepseek-ai/DeepSeek-V4-Flash \
  --out evals-out/kei-harness-setup-deepseek-$(date +%F) --jobs 2
```

## Results

### 2026-10-05 (added troubleshooting eval 6)

| Config | Pass rate | Errors |
| --- | --- | --- |
| with_skill | 60% (12/20) | 0 |
| without_skill | 0% (0/6) | 4 |

Added eval 6 for HAI-372 (policy bundle schema rejection — dst_pattern without
tool: prefix). without_skill had 4 incomplete runs (permission rejections in the
opencode harness), so the 0% figure is based on only 6 completed evaluations.
With the skill the new eval passed 4/4 expectations.

See `results/2026-10-05-opencode-deepseek-v4-flash/` for detailed outputs.

### 2026-10-02 (baseline)

| Config | Pass rate | Errors |
| --- | --- | --- |
| with_skill | 44% (4/9) | 0 |
| without_skill | 11% (1/9) | 0 |

See `results/2026-10-02-opencode-deepseek-v4-flash/` for detailed outputs.
