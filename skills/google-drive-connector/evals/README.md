# google-drive-connector evals

Eval cases for the Google Drive connector skill.

## Running

```bash
node scripts/run-evals.mjs --skill google-drive-connector --harness opencode \
  --model ray/deepseek-ai/DeepSeek-V4-Flash \
  --out evals-out/google-drive-connector-deepseek-$(date +%F) --jobs 2
```

## Results

See `results/` for committed benchmark outputs.
