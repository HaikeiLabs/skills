# discord-connector evals

Eval cases for the Discord connector skill.

## Running

```bash
node scripts/run-evals.mjs --skill discord-connector --harness opencode \
  --model-profile glm-5.3-flash --jobs 1 \
  --out evals-out/discord-connector-glm-$(date +%F)
```

```bash
node scripts/run-evals.mjs --skill discord-connector --harness opencode \
  --model-profile qwen3.8-27b --jobs 1 \
  --out evals-out/discord-connector-qwen-$(date +%F)
```

## Results

See `results/` for committed benchmark outputs.
