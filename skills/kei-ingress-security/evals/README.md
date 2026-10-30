# kei-ingress-security evals

Eval cases for the kei-ingress-security skill (fail-closed ingress invariants).

## Running

```bash
node scripts/run-evals.mjs --skill kei-ingress-security --harness opencode \
  --model-profile glm-5.3-flash \
  --out evals-out/kei-ingress-security-glm-$(date +%F) --jobs 1
```

## Results

See `results/` for detailed outputs.
