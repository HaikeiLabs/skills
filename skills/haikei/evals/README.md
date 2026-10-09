# haikei evals

Eval cases for the Haikei product-discovery skill. Routes user requests to the
correct Kei surface and skill (kei-cli, kei-api, kei-credential-rotation,
kei-audit-encryption, kei-setup-doctor, kei-harness-setup, kei-agents,
kei-api-conventions, agentware-sdk, linear-connector, etc.).

## Running

```bash
node scripts/run-evals.mjs --skill haikei --harness opencode \
  --model ray/deepseek-ai/DeepSeek-V4-Flash --jobs 2
```

## Results

| Config | Pass rate | Errors |
| --- | --- | --- |
| with_skill | — | — |
| without_skill | — | — |

(First run — results will be populated after the initial benchmark.)
