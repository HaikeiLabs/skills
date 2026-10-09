# kei-api evals

Eval cases for the Kei governed API skill (resource-oriented CRUD, auth
schemes, workspace isolation, cross-tenant 404). Covers credential endpoints,
invitation flows, connector-bindings resource design, and audit-encryption-key
management.

## Running

```bash
node scripts/run-evals.mjs --skill kei-api --harness opencode \
  --model ray/deepseek-ai/DeepSeek-V4-Flash --jobs 2
```

## Results

| Config | Pass rate | Errors |
| --- | --- | --- |
| with_skill | — | — |
| without_skill | — | — |

(First run — results will be populated after the initial benchmark.)
