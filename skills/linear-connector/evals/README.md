# linear-connector evals

Eval cases for the Linear connector skill.

## Running

```bash
node scripts/run-evals.mjs --skill linear-connector --harness opencode \
  --model-profile deepseek-v4-flash --jobs 1 \
  --out evals-out/linear-connector-deepseek-$(date +%F)
```

```bash
node scripts/run-evals.mjs --skill linear-connector --harness opencode \
  --model-profile qwen3.8-27b --jobs 1 \
  --out evals-out/linear-connector-qwen-$(date +%F)
```

## Results

See `results/` for committed benchmark outputs.
