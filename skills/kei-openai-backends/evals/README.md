# kei-openai-backends evals

Eval cases for the kei-openai-backends skill (OpenAI-compatible LLM backend integration).

## Running

```bash
node scripts/run-evals.mjs --skill kei-openai-backends --harness opencode \
  --model-profile deepseek-v4-flash \
  --out evals-out/kei-openai-backends-deepseek-$(date +%F) --jobs 1
```

## Results

See `results/` for detailed outputs.
