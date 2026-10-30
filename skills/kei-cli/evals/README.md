# kei-cli evals

Case 29 covers the Cursor harness value for `kei connect` (HAI-882): cursor is
listed but is not released yet (kei-cli#233), so check `kei help` for the
installed version.

The existing cases cover CLI setup and operations. Eval 28 checks policy CLI
forms and model behavior. Some policy assertions predate the final identity
source model; do not use those assertions as product guidance.

DeepSeek is no longer an eval model. Use local-only profile copies for GLM-5.3
and Qwen at temperature 0; keep those copies and all results out of git. For
example, after adding a local `glm-5.3` profile:

```sh
node scripts/run-evals.mjs --skill kei-cli \
  --model-profile glm-5.3 --jobs 1 --repeats 3
```

Run Qwen serially with `--jobs 1`, one suite at a time, through the available
Qwen lock. If the lock is unavailable, confirm the shared model host is idle
before running and note that in the PR body. Results stay in ignored
`evals-out/`; do not commit benchmark output.
