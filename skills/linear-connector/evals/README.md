# linear-connector evals

Eval cases for the Linear connector skill.

## Running

```bash
node scripts/run-evals.mjs --skill linear-connector --harness opencode \
  --model-profile deepseek-v4-flash --jobs 1 \
  --out evals-out/linear-connector-deepseek-$(date +%F)
```

```bash
node scripts/run-evals.mjs --skill linear-connector --harness opencode \
  --model-profile qwen3.8-27b --jobs 1 \
  --out evals-out/linear-connector-qwen-$(date +%F)
```

## Results

See `results/` for committed benchmark outputs.

Latest (2026-10-10, opencode, `--no-baseline --repeats 2 --jobs 1`, 8 cases;
cases 7 and 8 cover `references/setup.md`):

| Model profile | Pass rate |
| --- | ---: |
| deepseek-v4-flash | 100% (8/8) |
| qwen3.8-27b | 100% (8/8) |
