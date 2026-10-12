# kei-proxy evals

Eval cases for the kei-proxy skill (runtime proxy executable for governed decisions).

## Running

Checks are deterministic (case-insensitive string checks in `evals.json`, no
LLM grader). The CI gate (`.github/workflows/agent-evals.yaml`) runs every
case 3 times per model profile at temperature 0 with a fixed seed, and gates
on the average pass rate (threshold 0.95). To reproduce it locally:

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

Case 7 covers identity mode running `opaque_ref`/`http_api` connectors from v2 bundle descriptors (HAI-378): the new deny codes and the release status (not live in proxy-v0.2.4; needs `POLICY_BUNDLE_V2_CONNECTORS`). It asks one bounded question so a run stays short.

Case 8 covers what `kei-proxy hook claude` records for a failed call and an asked call (the `failed` flag, `decision` and `permission_reply` events), that the hook never answers a permission prompt, and which versions it needs.

## Results

See `results/` for detailed outputs.
