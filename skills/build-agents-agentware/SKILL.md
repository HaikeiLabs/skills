---
name: build-agents-agentware
description: Build a governed AI agent end to end with the open-source kei-agents package and the agentware SDK — compose a prebuilt agent or workflow (Pedro, the PDE search agent, bug_to_linear_pr, crm_linear_followup, …) from its system prompt and rendered tools, wrap every tool call with AuditedToolClient so it is decided by policy, audited, and attributed to the invoking human, swap the local policy for KeiProxyEvaluator to let Kei decide, and design tool arguments with the Lexicon/Pragmatics/Semantics rule (relationship arguments carry the parent id; proxy-delegated scope is never an argument). Use when someone asks how to build, compose, or wire up an agent with agentware or kei-agents, how to govern or audit an agent's tool calls, what a tool's arguments should be, or how a subagent keeps the human's identity. For testing the agent load test-agents; for shipping it load deploy-agents.
---

# Build agents with the agentware SDK

An agent you can put in front of a customer has three layers. Keep them
separate; each has one owner:

| Layer | What it is | Package |
| --- | --- | --- |
| **Definition** | System prompt + tool schemas + the permissions the agent may hold | `kei-agents` (`agents` import) |
| **Governance** | Every tool call is decided (allow/deny/filter), audited, and attributed to a human | agentware SDK (`pedro_agentware`, Go, TypeScript) |
| **Runtime decision** | The live allow/deny comes from the workspace policy, made tenant-side | `kei-proxy`, reached through `KeiProxyEvaluator` |

The model never decides what it is allowed to do. A refusal in the prompt is
not a control; the policy check in front of the tool is.

## Install

Both Python packages install from a checkout (neither is on public PyPI yet):

```bash
git clone https://github.com/HaikeiLabs/agentware && git clone https://github.com/HaikeiLabs/kei-agents
python -m venv .venv && . .venv/bin/activate
pip install -e ./agentware/python -e ./kei-agents        # Python >= 3.10
```

TypeScript: `npm install @haikeilabs/agentware` (>= 0.7.0). Go:
`go get github.com/soypete/pedro-agentware/go`.

## 1. Compose a prebuilt agent

`kei-agents` ships agents as data: an `AgentDefinition` names the agent's
permissions, its catalog tools, and a system prompt file inside the package.
Today there are two: `PEDRO_AGENT` (Discord) and `PDE_SEARCH_AGENT` (PDE).

```python
from agents import (
    PEDRO_AGENT, ModelFormat, get_agent_tools, load_system_prompt,
    render_tools, validate_agent_definitions,
)

assert validate_agent_definitions([PEDRO_AGENT]) == []      # well formed, not "permitted"
system_prompt = load_system_prompt(PEDRO_AGENT)              # reads prompts/pedro.md
tools = render_tools(get_agent_tools(PEDRO_AGENT), ModelFormat.OPENAI)
# 29 OpenAI function tools; tools[0]["function"]["name"] == "file_bug"
```

`render_tools` also takes `ModelFormat.ANTHROPIC`, `ModelFormat.OLLAMA`, or a
model name to auto-detect the format. Pass `system_prompt` and `tools` to
whatever model client your harness uses; nothing here calls a model.

**Workflows** (`bug_to_linear_pr`, `crm_linear_followup`, `finance`,
`fundraising`, `github_pr_review`, `leads`, `support`) ship a prompt under
`prompts/workflows/` and a list of catalog tools. The eval targets are the
easiest place to read both from:

```python
from importlib import resources
from agents import ModelFormat, get_tool_by_name, render_tools
from agents.evals.targets import WORKFLOW_TARGETS

target = next(t for t in WORKFLOW_TARGETS if t.name == "crm_linear_followup")
prompt = resources.files("agents").joinpath(target.prompt_file).read_text(encoding="utf-8")
tools = render_tools([get_tool_by_name(n) for n in target.tools], ModelFormat.OPENAI)
# tools: crm_lookup_lead, linear.create_followup_task
```

To define your own agent, build an `AgentDefinition(name=..., harness=...,
description=..., permissions=frozenset({Permission.LINEAR_WRITE, ...}),
tools=(...), system_prompt="...")` and run `validate_agent_definitions` in a
test. It rejects bare-string permissions, unknown tools, tools whose
permission is not granted, and any `*_approve` permission (reserved; agents
never hold one). `system_prompt_file` must resolve inside the `agents`
package, so an out-of-tree agent uses inline `system_prompt`.

## 2. Wrap every tool call with the SDK

`AuditedToolClient` puts one gate in front of each tool function: evaluate
policy, record an audit entry, then run the tool only when allowed. A denial
raises `PermissionError`; it is still audited.

```python
import asyncio
from pedro_agentware.middleware import (
    Action, AuditedToolClient, CallerContext, Policy, Rule, SimplePolicyEvaluator,
)

# Local policy: the Discord default group may use three tools; everything else is denied.
local = SimplePolicyEvaluator(Policy(
    rules=[Rule(name="default-group", tools=["file_bug", "search_wiki", "web_search"],
                action=Action.ALLOW)],
    default_deny=True,
))
client = AuditedToolClient(source="my-harness", evaluator=local)

def file_bug(**args):
    return {"issue": f"{args['team_key']}-123"}

caller = CallerContext(user_id="discord:42", session_id="chan-1",
                       invoking_subject="discord:42", role="member")

async def main():
    await client.Execute("file_bug",
                         {"team_key": "KEI", "title": "Login 500", "description": "…", "severity": "high"},
                         user_id="discord:42", channel_id="chan-1", guild_id=None,
                         func=file_bug, caller=caller)              # allowed
    try:
        await client.Execute("crm_list_leads", {}, user_id="discord:42", channel_id="chan-1",
                             guild_id=None, func=lambda **a: [], caller=caller)
    except PermissionError as exc:                                  # denied, and audited
        print(exc)   # denied by policy: no matching rules and default deny is enabled
    for r in client.records():
        print(r.tool_name, r.decision.action.value, r.invoking_subject)

asyncio.run(main())
```

Rules are first-match-wins; `default_deny=True` makes an unlisted tool a deny.
A rule can also match `conditions` on args or caller fields, rate-limit with
`max_rate`, or return `Action.FILTER` with `redact_fields`.

### Let Kei decide: `KeiProxyEvaluator`

The local policy is for tests and offline use. In a deployed harness, swap the
evaluator; the client, the tools, and the audit stay the same:

```python
from pedro_agentware.kei import KeiProxyAuthorizeClient, KeiProxyEvaluator

client.with_policy(KeiProxyEvaluator(KeiProxyAuthorizeClient(executable="kei-proxy", timeout=10.0)))
```

It runs `kei-proxy authorize` per call and **fails closed**: only an explicit
`allow`/`permit` with exit 0 allows. A missing binary (`proxy_unavailable`),
an unset `KEI_RUNTIME_TOKEN` (`missing_token`), a timeout, or unparseable
output is a DENY. Pin the binary with `expected_sha256=` (absolute path
required). The token reaches the child through the environment only, never
argv. The harness sends the tool name and never an authorize resource; the
catalog resolves resources from the tool's registered scope.

On a deny, `decision.enrollment` (an unlinked chat user) or `decision.connect`
(the user's own OAuth connection is missing or expired) may carry a one-time
link. `AuditedToolClient` turns a deny into `PermissionError`, so when you
need those links call `evaluator.evaluate(tool, args, caller)` yourself first
and send the `url` privately to that user. Never log it or post it in a shared
channel. The `agentware-sdk` skill has the full decision table and the Go
(`evaluator.NewKeiProxyEvaluator`) and TypeScript (async-only
`await evaluator.evaluate(...)`) spellings.

### Keep the human as the invoking subject

`invoking_subject` is the person who started the task. It is set once at the
human entry point and carried unchanged through every subagent hop:

```python
child = caller.delegate()        # parent_span = caller's span, delegation_depth + 1
assert child.invoking_subject == caller.invoking_subject
```

`delegate()` refuses to override `invoking_subject`. Never replace it with the
agent's own service identity; the audit trail would then say "the bot did it".
Agent identity is discovered from the runtime (`link.identity()`), never from
an env var; if it is unavailable, deny governed calls.

## 3. Design tool arguments: Lexicon, Pragmatics, Semantics

Tool schemas are where most agent bugs start. HaikeiLabs connector skills
describe each provider in three sections, and a tool takes its shape from them:

| Section | Answers | Goes into the tool as |
| --- | --- | --- |
| **Lexicon** | What the provider calls things (commands, endpoints, field names) | Argument **names** |
| **Pragmatics** | When and how an agent should use it | The tool **description** ("Use when… Not for…") |
| **Semantics** | Entities, parent relationships, key fields and their values | **Relationship arguments** and **enum** values |

The Semantics rule:

1. **A child resource's arguments include its parent's identifier.** A Linear
   issue is created in a team, so the tool takes `team_id` (or `team_key`,
   as `file_bug` does). A Drive document is created in a folder, so it takes
   `folder_id`. A CRM follow-up task takes `lead_id`.
2. **Enum values come from the Semantics key-fields table** — `severity`:
   `critical|high|medium|low`, not free text.
3. **Proxy-delegated scope is never an argument.** `tenant_id`, `org_id`,
   `workspace`/`workspace_id`, `repository`, `bucket`, `drive_id`, `mailbox`
   come from the runtime token and the connector binding. An agent that can
   pass them can widen its own scope.

```python
from agents import ModelFormat, Permission, ToolCategory, ToolDefinition, ToolParameter, render_tools

create_task = ToolDefinition(
    name="tracker.create_task",
    description="Create a task in a Linear team. Use when the user asks to track follow-up work. Not for bugs (use file_bug).",
    parameters=[
        ToolParameter(name="team_id", description="ID of the Linear team that owns the task (parent)", required=True),
        ToolParameter(name="title", description="Short task title", required=True),
        ToolParameter(name="priority", description="urgent, high, medium or low", enum=["urgent", "high", "medium", "low"]),
    ],
    permission=Permission.LINEAR_WRITE,
    category=ToolCategory.LINEAR,
)
render_tools([create_task], ModelFormat.OPENAI)   # no tenant_id, workspace or repository anywhere
```

Eval cases then pin it: `"args": {"team_key": "KEI"}` for the parent, and
`"forbidden_arg_keys": ["tenant_id", "workspace", "repository"]` for the
scope (see `test-agents`).

## 4. Register governed tools with Kei

Before Kei can decide a tool by name, an admin loads its scope into the
catalog. In agentware 0.7.0 a tool declares a `KeiScope` (service, action,
resource patterns), and `ToolRegistry.export_kei_tool_manifest()` emits
deterministic JSON for the admin to load. The runtime never registers tools
itself. Details: `agentware-sdk`, "Making governed tool calls".

## Validation commands

```bash
# In a kei-agents checkout
pytest && ruff check . && mypy src/agents
python -c "from agents import HARNESS_AGENT_DEFINITIONS, validate_agent_definitions as v; print(v(HARNESS_AGENT_DEFINITIONS))"   # []

# In an agentware checkout
cd python && pytest tests/kei/ -v                 # KeiProxyEvaluator fail-closed table
cd python && pytest tests/action_tool_boundary_test.py -v

# Prove fail-closed locally: with no kei-proxy on PATH every call is denied
PATH=/usr/bin:/bin python your_harness.py         # expect "kei-proxy missing_token" or "proxy_unavailable"
```

## Realistic usage boundaries

- The code is the source of truth. `docs/{python,go,typescript}/README.md` in
  agentware show old APIs (`middleware_py`, `LangGraphToolWrapper`) that no
  longer exist; trust the tests and the package exports.
- `kei-agents` is schemas, prompts, and permissions only. It has no provider
  clients and resolves no credentials; provider execution happens tenant-side
  in `kei-proxy`.
- `validate_agent_definitions` says an agent is well formed, not that it is
  allowed. The allow/deny is the workspace policy, at run time.
- Middleware decides and audits; it does not run the agent loop. Your harness
  (or `middleware/inference.py`) owns the loop.
- Writes (GitHub, CRM, Linear) are agent action tools executed by the harness,
  not connector capabilities.

## Related skills

- `agentware-sdk` — full SDK reference, decision table, Go/TypeScript ports.
- `kei-agents` — the tool catalog, governed connector read schemas, `render_tools`.
- `test-agents` — table-test evals for the agent you just built.
- `deploy-agents` — runtime, harness, policies, and per-user connectors.
- `templates/connector-skill` — where Lexicon/Pragmatics/Semantics are written down.
