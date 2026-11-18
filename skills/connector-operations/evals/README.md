# connector-operations evals

Run the suite against both required profiles with three repeats:

```sh
node scripts/run-evals.mjs --skill connector-operations \
  --model-profile glm-5.3-flash --jobs 1 --repeats 3
turnlock.sh qwen <worker> node scripts/run-evals.mjs --skill connector-operations \
  --model-profile qwen3.8-27b --jobs 1 --repeats 3
```

Run Qwen serially through the shared Qwen lock, one suite per ticket. Results
stay in ignored `evals-out/`; do not commit benchmark output. The CI gate and
its sticky pull request comment are the record.
