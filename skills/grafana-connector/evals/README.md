# grafana-connector evals

Eval cases for the Grafana connector skill.

## Running

```bash
node scripts/run-evals.mjs --skill grafana-connector --harness opencode \
  --model ray/deepseek-ai/DeepSeek-V4-Flash \
  --out evals-out/grafana-connector-deepseek-$(date +%F) --jobs 2
```

## Results

See `results/` for committed benchmark outputs.
