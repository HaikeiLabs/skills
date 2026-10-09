# agentware-sdk evals

Eval cases for the Agentware middleware policy/audit skill. Includes identity
resolution (link.identity()), the third-party harness contract
(AuthProvider/ToolExecutor/SecretProvider), enrollment DENY handling, and
KeiProxyEvaluator construction in Python.

## Running

```bash
node scripts/run-evals.mjs --skill agentware-sdk --harness opencode \
  --model ray/deepseek-ai/DeepSeek-V4-Flash --jobs 2
```

## Results

| Config | Pass rate | Errors |
| --- | --- | --- |
| with_skill | — | — |
| without_skill | — | — |

(First run — results will be populated after the initial benchmark.)
