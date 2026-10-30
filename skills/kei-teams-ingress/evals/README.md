# kei-teams-ingress evals

Eval cases for the kei-teams-ingress skill (Microsoft Teams and Bot Framework integration).

## Running

```bash
node scripts/run-evals.mjs --skill kei-teams-ingress --harness opencode \
  --model-profile glm-5.3-flash \
  --out evals-out/kei-teams-ingress-glm-$(date +%F) --jobs 1
```

## Results

See `results/` for detailed outputs.
