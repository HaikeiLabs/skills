# kei-directory-sync evals

Eval cases for the kei-directory-sync skill (per-org Entra directory sync:
Azure setup, the federated credential, `kei directory-sync`, the dry-run
report, and troubleshooting).

## Running

```bash
node scripts/run-evals.mjs --skill kei-directory-sync \
  --model-profile glm-5.3-flash --jobs 1 --repeats 3
node scripts/run-evals.mjs --skill kei-directory-sync \
  --model-profile qwen3.8-27b --jobs 1 --repeats 3
```

Results go to `evals-out/` and are not committed; the agent-evals CI gate's
pull request comment is the record.
