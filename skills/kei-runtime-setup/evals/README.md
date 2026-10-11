# kei-runtime-setup evals

Eval cases for the runtime setup skill.

## Running

Checks are deterministic (case-insensitive string checks in `evals.json`, no
LLM grader). The CI gate (`.github/workflows/agent-evals.yaml`) runs every
case 3 times per model profile at temperature 0 with a fixed seed, and gates
on the average pass rate (threshold 0.95). To reproduce it locally:

```bash
node scripts/run-evals.mjs --skill kei-runtime-setup --harness opencode \
  --model-profile deepseek-v4-flash --repeats 3 --jobs 1 \
  --out evals-out/kei-runtime-setup-deepseek-$(date +%F)
node scripts/run-evals.mjs --skill kei-runtime-setup --harness opencode \
  --model-profile qwen3.8-27b --repeats 3 --jobs 1 \
  --out evals-out/kei-runtime-setup-qwen-$(date +%F)
```

`evals-out/` is ignored by git. Don't commit local benchmark results; the CI
gate's report is the record.

## Cases

Case 7 covers identity mode with an `opaque_ref` connector (HAI-378): `kei-proxy credential sync` must deliver the secret first, with the same `KEI_RUNTIME_STATE_DIR` as `kei-proxy serve`, and the release status.

## Results

| Config | Pass rate | Errors |
| --- | --- | --- |
| with_skill | 90% (9/10) | 0 |
| without_skill | 20% (2/10) | 0 |

See `results/2026-10-02-opencode-deepseek-v4-flash/` for detailed outputs.
