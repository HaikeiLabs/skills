# kei-ingress-security evals

Eval cases for the kei-ingress-security skill (fail-closed ingress invariants).

## Running

```bash
node scripts/run-evals.mjs --skill kei-ingress-security --harness opencode \
  --model-profile deepseek-v4-flash \
  --out evals-out/kei-ingress-security-deepseek-$(date +%F) --jobs 1
```

## Results

See `results/` for detailed outputs.
