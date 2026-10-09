# kei-proxy evals

Eval cases for the kei-proxy skill (runtime proxy executable for governed decisions).

## Running

```bash
node scripts/run-evals.mjs --skill kei-proxy --harness opencode \
  --model-profile deepseek-v4-flash \
  --out evals-out/kei-proxy-deepseek-$(date +%F) --jobs 1
```

## Results

See `results/` for detailed outputs.
