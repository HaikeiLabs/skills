# kei-harness-policy evals

Deterministic cases cover group standing policies, time-bound access grants,
typed targets, deny precedence, bindings as wiring, and the console Policies
reference. Review the cases against the current policy model before treating
legacy identity-source or import expectations as current guidance.

DeepSeek is no longer an eval model. Use local-only profile copies for GLM-5.3
and Qwen at temperature 0; keep those copies and all results out of git. For
example, after adding a local `glm-5.3` profile:

```sh
node scripts/run-evals.mjs --skill kei-harness-policy \
  --model-profile glm-5.3 --jobs 4 --repeats 3
```

Run Qwen serially with `--jobs 1`, one suite at a time, through the available
Qwen lock. If the lock is unavailable, confirm the shared model host is idle
before running and note that in the PR body:

```sh
node scripts/run-evals.mjs --skill kei-harness-policy \
  --model-profile qwen3.8-27b --jobs 1 --repeats 3
```

Results stay in ignored `evals-out/`; do not commit benchmark output.
