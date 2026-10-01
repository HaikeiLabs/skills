# github-connector evals

Eval cases for the GitHub connector skill.

## Running

```bash
node scripts/run-evals.mjs --skill github-connector --harness opencode \
  --model ray/deepseek-ai/DeepSeek-V4-Flash \
  --out evals-out/github-connector-deepseek-$(date +%F) --jobs 2
```

## Results

See `results/` for committed benchmark outputs.
