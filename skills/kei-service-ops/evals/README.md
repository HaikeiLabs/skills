# kei-service-ops evals

Eval cases for the service operations skill.

## Files

- `evals.json` — eval cases used by `scripts/run-evals.mjs`

## Running

```bash
node scripts/run-evals.mjs --skill kei-service-ops --harness opencode \
  --model-profile glm-5.3-flash \
  --out evals-out/kei-service-ops-glm-$(date +%F) --jobs 1
```

Results go to `evals-out/`, which git ignores. Do not commit them: the
agent-evals CI gate and its sticky pull request comment are the record
(see [docs/evals.md](../../../docs/evals.md)).

## Adding eval cases

1. Add a new object to the `evals` array in `evals.json`
2. Use the next integer `id`
3. Include `prompt`, `expected_output`, and `expectations` (array of strings)
4. Add one deterministic `check` per expectation (`contains_all`,
   `contains_any`, `regex`, `not_contains`)
5. Optionally set `long` to a boolean. Use `true` for cases that overflow the
   model context or time out; `--skip-long` excludes them from a run.
6. Verify with `node scripts/verify-evals.mjs`

How the case format, model profiles and the CI gate work:
[docs/evals.md](../../../docs/evals.md).
