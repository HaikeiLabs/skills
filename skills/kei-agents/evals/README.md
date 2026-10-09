# kei-agents evals

Eval cases for the kei-agents package skill (agent definitions, tool schemas,
permission gates, multi-model rendering). Covers ToolDefinition,
ToolBinding, validate_tool_definitions, render_tools, ModelFormat, Permission
with ABAC conditions, and delegated_context.

## Running

```bash
node scripts/run-evals.mjs --skill kei-agents --harness opencode \
  --model ray/deepseek-ai/DeepSeek-V4-Flash --jobs 2
```

## Results

| Config | Pass rate | Errors |
| --- | --- | --- |
| with_skill | — | — |
| without_skill | — | — |

(First run — results will be populated after the initial benchmark.)
