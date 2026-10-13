# kei-agents evals

Eval cases for the kei-agents package skill (agent definitions, tool schemas,
permission gates, multi-model rendering). Covers ToolDefinition,
ToolBinding, validate_tool_definitions, render_tools, ModelFormat, Permission
with ABAC conditions, and delegated_context.

## Running

Checks are deterministic (case-insensitive string checks in `evals.json`, no
LLM grader). The CI gate (`.github/workflows/agent-evals.yaml`) runs every
case 3 times per model profile with its fixed sampling and seed, and gates
on the average pass rate (threshold 0.95). To reproduce it locally:

```bash
node scripts/run-evals.mjs --skill kei-agents --harness opencode \
  --model-profile deepseek-v4-flash --repeats 3 --jobs 1 \
  --out evals-out/kei-agents-deepseek-$(date +%F)
node scripts/run-evals.mjs --skill kei-agents --harness opencode \
  --model-profile qwen3.8-27b --repeats 3 --jobs 1 \
  --out evals-out/kei-agents-qwen-$(date +%F)
```

`evals-out/` is ignored by git. Don't commit local benchmark results; the CI
gate's report is the record.

## Cases

Case 7 covers where `http_api`/CRM reads execute (HAI-378): CRM is an `http_api` connector named `crm`, it runs in kei-proxy identity mode, and it is not live until `POLICY_BUNDLE_V2_CONNECTORS` is enabled.

## Results

| Config | Pass rate | Errors |
| --- | --- | --- |
| with_skill | — | — |
| without_skill | — | — |

(First run — results will be populated after the initial benchmark.)
