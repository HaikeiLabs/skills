# kei-proxy evals

Eval cases for the kei-proxy skill (runtime proxy executable for governed decisions).

## Running

```bash
node scripts/run-evals.mjs --skill kei-proxy --harness opencode \
  --model-profile deepseek-v4-flash \
  --out evals-out/kei-proxy-deepseek-$(date +%F) --jobs 1
```

## Cases

- Eval 7 covers what `kei-proxy hook claude` records for a failed call and an asked call (the `failed` flag, `decision` and `permission_reply` events), and that the hook never answers a permission prompt. Not run yet; add its results here after the next benchmark.

## Results

See `results/` for detailed outputs.
