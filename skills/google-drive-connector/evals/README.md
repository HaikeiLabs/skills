# google-drive-connector evals

Eval cases for the Google Drive connector skill.

## Running

```bash
node scripts/run-evals.mjs --skill google-drive-connector --harness opencode \
  --model-profile glm-5.3-flash --jobs 1 \
  --out evals-out/google-drive-connector-glm-$(date +%F)
```

```bash
node scripts/run-evals.mjs --skill google-drive-connector --harness opencode \
  --model-profile qwen3.8-27b --jobs 1 \
  --out evals-out/google-drive-connector-qwen-$(date +%F)
```

## Results

See `results/` for committed benchmark outputs.
