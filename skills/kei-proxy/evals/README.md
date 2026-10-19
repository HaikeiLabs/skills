# kei-proxy evals

Eval cases for the kei-proxy skill (runtime proxy executable for governed decisions).

## Running

Checks are deterministic (case-insensitive string checks in `evals.json`, no
LLM grader). The CI gate (`.github/workflows/agent-evals.yaml`) runs every
case once per model profile on a pull request and 3 times in the nightly
sweep of `main`, with the profile's fixed sampling and seed, and gates on the
average pass rate (threshold 0.90). To reproduce the nightly run locally:

```bash
node scripts/run-evals.mjs --skill kei-proxy --harness opencode \
  --model-profile deepseek-v4-flash --repeats 3 --jobs 1 \
  --out evals-out/kei-proxy-deepseek-$(date +%F)
node scripts/run-evals.mjs --skill kei-proxy --harness opencode \
  --model-profile qwen3.8-27b --repeats 3 --jobs 1 \
  --out evals-out/kei-proxy-qwen-$(date +%F)
```

`evals-out/` is ignored by git. Don't commit local benchmark results; the CI
gate's report is the record.

## Cases

Case 7 checks connector availability against the installed runtime and bundle, and teaches fail-closed denial reasons without relying on stale release claims.

Case 9 covers the daemon socket client as primary, tool registration through `POST /v1/tools:register`, the `kei harness sync --manifest` alternative, and the CLI fallback.

Case 8 covers what `kei-proxy hook claude` records for a failed call and an asked call (the `failed` flag, `decision` and `permission_reply` events), that the hook never answers a permission prompt, and which versions it needs.

## Results

See `results/` for detailed outputs.
