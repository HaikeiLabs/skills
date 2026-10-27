# CONNECTOR_NAME evals

Eval cases for the connector skill template. Replace `CONNECTOR_NAME` with the connector skill directory name (e.g., `discord-connector`, `linear-connector`).

## Running

```bash
node scripts/run-evals.mjs --skill CONNECTOR_NAME --harness opencode \
  --model-profile glm-5.3-flash --jobs 1 \
  --out evals-out/CONNECTOR_NAME-glm-$(date +%F)
```

```bash
node scripts/run-evals.mjs --skill CONNECTOR_NAME --harness opencode \
  --model-profile qwen3.8-27b --jobs 1 \
  --out evals-out/CONNECTOR_NAME-qwen-$(date +%F)
```

## Results

Don't commit local runs. The agent-evals CI gate and its sticky pull request
comment are the record of a skill's pass rates; local runs (under `evals-out/`,
ignored by git) are for tuning.
