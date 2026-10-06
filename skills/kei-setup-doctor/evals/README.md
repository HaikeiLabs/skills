# kei-setup-doctor evals

Eval cases for the setup doctor skill.

## Running

```bash
node scripts/run-evals.mjs --skill kei-setup-doctor --harness opencode \
  --model ray/deepseek-ai/DeepSeek-V4-Flash \
  --out evals-out/kei-setup-doctor-deepseek-$(date +%F) --jobs 2
```

## Results

### 2026-10-06 (eval cases 9-10)

| Config | Pass rate | Errors |
| --- | --- | --- |
| with_skill | 76% (22/29) | 0 |
| without_skill | 0% (0/6) | 8 |

Added eval cases 9 (stale policy bundle, HAI-403) and 10 (stale proxy cache,
HAI-404). with_skill improved from 71% to 76%. without_skill had 8 incomplete
runs (permission rejections or glob timeouts in the opencode harness); only
evals 2 and 10 completed.

See `results/2026-10-06-opencode-deepseek-v4-flash/` for detailed outputs.

### 2026-10-02 (baseline)

| Config | Pass rate | Errors |
| --- | --- | --- |
| with_skill | 71% (15/21) | 0 |
| without_skill | 13% (2/16) | 2 |

See `results/2026-10-02-opencode-deepseek-v4-flash/` for detailed outputs.
