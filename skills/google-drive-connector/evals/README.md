# google-drive-connector evals

Eval cases for the Google Drive connector skill.

## Running

```bash
node scripts/run-evals.mjs --skill google-drive-connector --harness opencode \
  --model-profile deepseek-v4-flash --jobs 1 \
  --out evals-out/google-drive-connector-deepseek-$(date +%F)
```

```bash
node scripts/run-evals.mjs --skill google-drive-connector --harness opencode \
  --model-profile qwen3.8-27b --jobs 1 \
  --out evals-out/google-drive-connector-qwen-$(date +%F)
```

## Results

See `results/` for committed benchmark outputs.
