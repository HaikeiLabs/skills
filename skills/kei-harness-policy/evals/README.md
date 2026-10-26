# kei-harness-policy evals

Deterministic cases cover the current policy commands and model: group and
autogroup standing policies, time-bound access grants, typed targets, required
`--src` for policy import, deny wins without priority, bindings as wiring, and
the console Policies reference for human-facing details.

Run DeepSeek with its fixed profile:

```sh
node scripts/run-evals.mjs --skill kei-harness-policy \
  --model-profile deepseek-v4-flash --jobs 4 --repeats 3
```

Run local Qwen through the worker host Qwen turnlock, with one suite per ticket:

```sh
turnlock.sh qwen <worker> node scripts/run-evals.mjs \
  --skill kei-harness-policy --model-profile qwen3.8-27b --jobs 1 --repeats 3
```

Results stay in ignored `evals-out/`; do not commit benchmark output.
