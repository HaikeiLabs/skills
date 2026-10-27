# kei-tool-adapters evals

Eval cases for the kei-tool-adapters skill (TypeScript tool adapters and governor tool-lane pattern).

## Running

```bash
node scripts/run-evals.mjs --skill kei-tool-adapters --harness opencode \
  --model-profile glm-5.3-flash \
  --out evals-out/kei-tool-adapters-glm-$(date +%F) --jobs 1
```

## Results

See `results/` for detailed outputs.
