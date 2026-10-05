# google-drive-connector evals

Eval cases for the Google Drive connector skill. Covers API usage,
governed-connector boundaries, and connector setup — including the optional
`drive_id` field that scopes the connector to one Google shared drive.

## Running

```bash
node scripts/run-evals.mjs --skill google-drive-connector --harness opencode \
  --model ray/deepseek-ai/DeepSeek-V4-Flash \
  --out evals-out/google-drive-connector-deepseek-$(date +%F) --jobs 2
```

## Results

See `results/` for committed benchmark outputs.
