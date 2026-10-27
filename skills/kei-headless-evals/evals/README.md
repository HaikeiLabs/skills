# kei-headless-evals evals

Eval cases for the kei-headless-evals skill (deterministic eval harnesses).

## Running

```bash
node scripts/run-evals.mjs --skill kei-headless-evals --harness opencode \
  --model-profile glm-5.3-flash \
  --out evals-out/kei-headless-evals-glm-$(date +%F) --jobs 1
```

## Results

See `results/` for detailed outputs.
