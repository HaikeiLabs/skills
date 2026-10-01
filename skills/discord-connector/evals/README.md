# discord-connector evals

Eval cases for the Discord connector skill.

## Running

```bash
node scripts/run-evals.mjs --skill discord-connector --harness opencode \
  --model ray/deepseek-ai/DeepSeek-V4-Flash \
  --out evals-out/discord-connector-deepseek-$(date +%F) --jobs 2
```

## Results

See `results/` for committed benchmark outputs.
