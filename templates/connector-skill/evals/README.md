# CONNECTOR_NAME evals

Eval cases for the connector skill template. Replace `CONNECTOR_NAME` with the connector skill directory name (e.g., `discord-connector`, `linear-connector`).

## Running

```bash
node scripts/run-evals.mjs --skill CONNECTOR_NAME --harness opencode \
  --model-profile deepseek-v4-flash --jobs 1 \
  --out evals-out/CONNECTOR_NAME-deepseek-$(date +%F)
```

```bash
node scripts/run-evals.mjs --skill CONNECTOR_NAME --harness opencode \
  --model-profile qwen3.8-27b --jobs 1 \
  --out evals-out/CONNECTOR_NAME-qwen-$(date +%F)
```

## Results

See `results/` for committed benchmark outputs.
