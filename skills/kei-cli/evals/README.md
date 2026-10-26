# kei-cli evals

The existing cases cover CLI setup and operations. Eval 28 checks the current
policy CLI forms: group standing policies, policy tests, time-bound access
grants, the required import source flag, and the simplified policy model.

Run with the fixed sampling profile for each model:

```sh
node scripts/run-evals.mjs --skill kei-cli \
  --model-profile deepseek-v4-flash --jobs 1 --repeats 3
```

For local Qwen runs, use the worker host Qwen turnlock at `--jobs 1` and run
one suite per ticket, as described in the repository `AGENTS.md`. Results stay
in ignored `evals-out/`; do not commit benchmark output.
