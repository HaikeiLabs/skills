# kei-audit-encryption evals

Eval cases for the opt-in audit-args encryption skill. Includes negative
cases: refusing to print or upload the age private key, and decrypting to
stdout only with an explicit `--stdout`.

## Running

```bash
node scripts/run-evals.mjs --skill kei-audit-encryption --harness opencode \
  --model ray/deepseek-ai/DeepSeek-V4-Flash --jobs 2
```

## Results

| Config | Pass rate | Errors |
| --- | --- | --- |
| with_skill | 80% (36/45) | 0 |
| without_skill | 16% (7/45) | 0 |

See `results/2026-10-03-opencode-deepseek-v4-flash/` for the benchmark summary.

Note: the answers were produced by `scripts/run-evals.mjs` with the opencode
harness and `ray/deepseek-ai/DeepSeek-V4-Flash`. The repo's default `claude -p`
grader was unavailable at run time (weekly usage limit), so the responses were
graded with the script's exact grader prompt using the same model via
`opencode run`.
