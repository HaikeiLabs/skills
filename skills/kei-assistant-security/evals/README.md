# kei-assistant-security evals

Eval cases for the kei-assistant-security skill (fail-closed ingress invariants).

## Running

```bash
node scripts/run-evals.mjs --skill kei-assistant-security --harness opencode \
  --model-profile deepseek-v4-flash \
  --out evals-out/kei-assistant-security-deepseek-$(date +%F) --jobs 1
```

## Results

See `results/` for detailed outputs.
