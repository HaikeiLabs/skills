# kei-credential-rotation evals

Eval cases for the kei-credential-rotation skill (runtime credential rotation).

## Running

```bash
node scripts/run-evals.mjs --skill kei-credential-rotation --harness opencode \
  --model-profile glm-5.3-flash \
  --out evals-out/kei-credential-rotation-glm-$(date +%F) --jobs 1
```

## Results

See `results/` for detailed outputs.
