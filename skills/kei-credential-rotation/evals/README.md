# kei-credential-rotation evals

Eval cases for the kei-credential-rotation skill (runtime credential rotation).

## Running

```bash
node scripts/run-evals.mjs --skill kei-credential-rotation --harness opencode \
  --model-profile deepseek-v4-flash \
  --out evals-out/kei-credential-rotation-deepseek-$(date +%F) --jobs 1
```

## Results

See `results/` for detailed outputs.
