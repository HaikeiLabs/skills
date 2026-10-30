# kei-openai-backends evals

Eval cases for the kei-openai-backends skill (OpenAI-compatible LLM backend integration).

## Running

```bash
node scripts/run-evals.mjs --skill kei-openai-backends --harness opencode \
  --model-profile glm-5.3-flash \
  --out evals-out/kei-openai-backends-glm-$(date +%F) --jobs 1
```

## Results

See `results/` for detailed outputs.
