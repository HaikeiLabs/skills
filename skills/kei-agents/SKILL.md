---
name: kei-agents
description: Use the kei-agents package for agent definitions, tools, and schemas on the Kei AI-assistant platform. Use when defining agent capabilities, tool schemas, permission gates, multi-model tool rendering (OpenAI, Anthropic, Ollama, Llama, vLLM), governed connector read schemas (GitHub, Linear, Google Drive/Docs, S3, http_api/CRM), policy/permission evaluation, or semantic mappings between tools and connectors. Covers render_tools, ModelFormat, Permission, ToolDefinition, ToolBinding, PolicyEngine, and validate_tool_definitions; reads are connector capabilities, writes are agent action tools.
---

# Kei Agents

`kei-agents` defines **agent capabilities, tool schemas, and semantic mappings
only**. Provider execution and customer data retrieval happen in the
tenant-side distributed proxy; Kei is a metadata catalog and ABAC is a policy
decision point. This is a docs-only repository: no provider clients, no
credential resolution, no secret material.

Source of truth: `src/agents/` in the kei-agents repo (package import name
`agents`), `README.md`, `docs/connector-tool-schemas.md`. Install with
`pip install kei-agents` (PyPI publication is planned; see the distribution plan
in the repo).

## Public surface

```python
from agents import TOOL_DEFINITIONS, render_tools, ModelFormat

tools = render_tools(TOOL_DEFINITIONS, ModelFormat.OPENAI)  # or by model name: "gpt-4"
```

Also exported: `ALL_TOOL_DEFINITIONS`, per-connector read collections
(`CONNECTOR_READ_TOOL_DEFINITIONS`, `GITHUB_READ_TOOL_DEFINITIONS`,
`LINEAR_READ_TOOL_DEFINITIONS`, `DRIVE_READ_TOOL_DEFINITIONS`,
`S3_READ_TOOL_DEFINITIONS`, `HTTP_API_READ_TOOL_DEFINITIONS`),
`render_openai_tools`, `render_anthropic_tools`, `render_ollama_tools`,
`detect_model_format`, `get_tool_by_name`, `get_tools_by_category`,
`get_tools_by_permission`, `get_tools_for_model`, `validate_tool_definitions`,
plus the policy module and CRM/GitHub adapters.

## Core types

- `ModelFormat` — `OPENAI`, `ANTHROPIC`, `OLLAMA`, `LLAMA`, `VLLM`. `detect_model_format(name)`
  infers the format from a model name.
- `Permission` — the permission scopes that gate tools: `search_wiki`, `web_search`,
  `schedule_meetings`, `github_read`, `github_write`, `crm_read`, `crm_write`,
  `linear_read`, `drive_read`, `s3_read`, `http_api_read`.
- `ToolCategory` — `search`, `productivity`, `github`, `crm`, `entertainment`,
  `linear`, `drive`, `s3`, `http_api`.
- `ToolParameter` — name, type, description, required, enum, default.
- `ToolBinding` — **non-secret routing metadata**: `connector_id` references
  `abac.connection_presets.id`; `config` holds non-secret routing hints;
  `delegated_context` lists field names the tenant-side proxy supplies at invocation.
  Never carries secrets, credentials, or provider clients.
- `ToolDefinition` — name (must match `^[a-z0-9_]+(\.[a-z0-9_]+)*$`), description,
  parameters, permission gate, category, `service` (credential-lookup service; empty
  means policy-only), version, tags, optional `binding`, optional `handler`
  (harness-side; not required for the catalog).

## Example agent tools

| Tool | Description | Permission |
|------|-------------|------------|
| `search_wiki` | Search conversation history | `search_wiki` |
| `web_search` | Search the web | `web_search` |
| `schedule_meeting` | Schedule calendar meetings | `schedule_meetings` |
| `list_prs` / `list_issues` | List GitHub PRs/issues | `github_read` |
| `create_issue` / `create_pull_request` | Create GitHub issues/PRs | `github_write` |
| `get_workflow_status` | Get CI/CD workflow status | `github_read` |
| `start_game` | Start interactive games | `search_wiki` |

Full list is in `src/agents/tool_definitions.py`. GitHub mutations
(`create_issue`, `create_pull_request`) are **action tools gated by
`Permission.GITHUB_WRITE`** — they are never Kei connector capabilities.

## Governed connector read schemas

Provider-neutral, schema-only **read** capabilities. Each schema expresses:

1. **Capability binding** — a `Permission` gate (e.g. `linear_read`) and a `ToolCategory`.
2. **Resource binding** — `ToolBinding.config.resource` names the bound resource type
   (`repository`, `issues`, `objects`, `records`, ...). The resource scope is governed
   routing metadata, not an agent parameter.
3. **Action binding** — tool `name`/`description` are the action (list/get). Reads only;
   writes stay agent action tools.
4. **Delegated context** — `ToolBinding.delegated_context` lists non-secret field names
   the tenant-side proxy supplies at invocation. The agent never provides them, so they
   must not appear as tool parameters.

| Connector | Permission | Category | Read schemas | Delegated context |
|-----------|-----------|----------|--------------|-------------------|
| GitHub | `github_read` | `github` | `github.get_repository`, `github.get_issue`, `github.get_pull_request` | `tenant_id`, `repository` |
| Linear | `linear_read` | `linear` | `linear.list_issues`, `linear.get_issue`, `linear.list_projects` | `tenant_id`, `workspace` |
| Google Drive/Docs | `drive_read` | `drive` | `drive.list_files`, `drive.get_file`, `docs.get_document` | `tenant_id`, `drive_id` |
| S3 | `s3_read` | `s3` | `s3.list_objects`, `s3.get_object`, `s3.get_object_metadata` | `tenant_id`, `bucket` |
| http_api/CRM | `http_api_read` | `http_api` | `http_api.list_records`, `http_api.get_record` | `tenant_id` |

`connector_id` values (`conn_github_1`, `conn_linear_1`, ...) are placeholders that
reference `abac.connection_presets.id`; the tenant-side proxy resolves the real preset,
endpoint, and credentials at invocation time.

## Hard invariants (enforced by `validate_tool_definitions`)

- **No provider credentials** — binding config keys/values that look like secrets are rejected.
- **No arbitrary URLs** — binding config keys that look like endpoints (`url`, `endpoint`,
  `base_url`, `host`, ...) and any string value containing `://` are rejected. Endpoints
  resolve from the governed connection preset, never embedded.
- **No tenant IDs chosen by the agent** — a parameter that collides with a
  `delegated_context` field, or that looks like a tenant identifier (`tenant_id`,
  `account_id`, `customer_id`, `organization_id`, `org_id`), is rejected on governed
  connector read tools.
- **No direct provider calls** — governed connector read tools (a `*_read` permission with
  a binding) must not declare a `handler`; execution is delegated to the tenant-side proxy.
  They must also declare a `service`.

## Policy and permissions

`src/agents/policy.py`:

- `AuthorizationResult` — `ALLOW`, `DENY`, `REQUIRE_APPROVAL`.
- `PolicyDecision` — result + reason + required_permission + metadata.
- `PermissionContext` — user_id, permissions set, roles set, approval_context;
  `has_permission`/`add_permission`/`remove_permission`.
- `PolicyEngine` — `evaluate(tool, context)` (default: allow iff the context holds the
  tool's permission, else deny); `register_policy(tool_name, fn)` for custom policies;
  `evaluate_many`.
- `create_user_context(user_id, permission_names, roles)`, `check_tool_access`,
  `filter_accessible_tools`, `get_policy_engine`/`set_policy_engine`.

## Validation commands

```bash
# In a checkout of the kei-agents repo:
pip install -e ".[dev]"

# Tests, lint, typecheck (from README.md):
pytest
ruff check .
mypy src/agents

# Validate all tool definitions against the hard invariants:
python -c "from agents import validate_tool_definitions, ALL_TOOL_DEFINITIONS; print(validate_tool_definitions(ALL_TOOL_DEFINITIONS))"
```

## Realistic usage boundaries

- **Do not** add provider clients or credential resolution to this repository. It is a
  docs-only repo; that is a hard rule in `AGENTS.md`.
- **Do not** invent tool schemas or permissions that are not in `src/agents/`. The code
  wins over any description here.
- **Do not** add write capabilities to governed connector schemas. Reads are the only
  connector capabilities; GitHub/CRM/Linear writes are agent action tools executed by the
  agent harness, not ABAC connector capabilities.
- **Do not** let an agent supply `delegated_context` fields or tenant identifiers as tool
  parameters; that is a validation failure.
- **Do not** embed endpoints, credentials, or arbitrary URLs in binding config.
- `connector_id` values are placeholders referencing `abac.connection_presets.id`; do not
  treat them as real connector identifiers.
- The Python package is not yet on PyPI (publication planned); install from the repo until then.
