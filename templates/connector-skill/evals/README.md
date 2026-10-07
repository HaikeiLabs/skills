# CONNECTOR_NAME evals

This directory holds eval cases for the CONNECTOR_NAME skill.

## Files

- `evals.json` — eval cases used by `scripts/run-evals.mjs`
- `evals-out/` — local benchmark output (`benchmark.json` and `benchmark.md`; do not commit run artifacts)

## Running

```bash
node scripts/run-evals.mjs --skill CONNECTOR_NAME --model-profile deepseek-v4-flash --jobs 1
node scripts/run-evals.mjs --skill CONNECTOR_NAME --model-profile qwen3.8-27b --jobs 1
```

## Adding eval cases

1. Add a new object to the `evals` array in `evals.json`
2. Use the next integer `id`
3. Include `prompt`, `expected_output`, `expectations`, and one matching
   deterministic check for each expectation
4. Verify with `node scripts/verify-evals.mjs`

The runner grades case-insensitive `contains_all`, `contains_any`, `regex`,
and `not_contains` checks without an LLM grader. It writes `benchmark.json` and
`benchmark.md` and fails below a 0.9 with-skill pass rate by default. Use
`node scripts/verify-evals.mjs --strict` to require all checks during migration.
