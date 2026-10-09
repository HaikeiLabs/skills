# grafana-connector evals

Eval cases for the Grafana connector skill.

## Running

```bash
node scripts/run-evals.mjs --skill grafana-connector --harness opencode \
  --model-profile deepseek-v4-flash --jobs 1 \
  --out evals-out/grafana-connector-deepseek-$(date +%F)
```

```bash
node scripts/run-evals.mjs --skill grafana-connector --harness opencode \
  --model-profile qwen3.8-27b --jobs 1 \
  --out evals-out/grafana-connector-qwen-$(date +%F)
```

## Results

See `results/` for committed benchmark outputs.
