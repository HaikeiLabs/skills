# linear-connector evals

Eval cases for the Linear connector skill.

## Running

```bash
node scripts/run-evals.mjs --skill linear-connector --harness opencode \
  --model ray/deepseek-ai/DeepSeek-V4-Flash \
  --out evals-out/linear-connector-deepseek-$(date +%F) --jobs 2
```

## Results

See `results/` for committed benchmark outputs.
