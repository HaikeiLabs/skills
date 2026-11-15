# agentware-first-agent evals

Eval cases for the Kei-free beginner skill: building a first agent with the
open-source Agentware SDK. Covers the trigger (first agent, no Kei account),
the no-trigger boundaries (unrelated tasks, and requests that belong to the
Kei path), the first-agent program shape, and the exact API names
(AuditedToolClient, withPolicy, AgentLoop, AgentTerminationReason,
ResponseValidator, ToolRegistry, Result).

## Running

```bash
node scripts/run-evals.mjs --skill agentware-first-agent --harness opencode \
  --model-profile glm-5.3-flash --jobs 2
```

## Results

| Config | Pass rate | Errors |
| --- | --- | --- |
| with_skill | — | — |
| without_skill | — | — |

(First run — results will be populated after the initial benchmark.)
