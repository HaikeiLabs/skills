# Build governed AI agents with the agentware SDK

*Part 1 of 3: build, test, deploy.*

Most agent demos stop at "the model called the tool". The hard part comes
next: who was allowed to make that call, on whose behalf, and where is the
record of it? This guide builds an agent that answers all three, using two
open-source HaikeiLabs packages:

- **kei-agents** — agent definitions as data: system prompts, tool schemas, and
  the permissions each agent may hold.
- **agentware** — middleware that sits in front of every tool call. It asks a
  policy for a decision, records an audit entry, and runs the tool only when
  the answer is allow.

The rule underneath everything: **the model never decides what it is allowed to
do.** A line in the prompt saying "don't touch the CRM" is a suggestion. A
policy check in front of the CRM tool is a control.

## Three layers, three owners

| Layer | What it is | Where it lives |
| --- | --- | --- |
| Definition | System prompt, tool schemas, permissions | kei-agents |
| Governance | Each call decided, audited, and attributed to a person | agentware (Python, Go, TypeScript) |
| Runtime decision | The live allow or deny from your workspace policy | kei-proxy, reached through agentware's `KeiProxyEvaluator` |

Keeping these apart is what lets you swap a model, a harness, or a policy
without rewriting the agent.

## Install

The Python packages install from a checkout; neither is on public PyPI yet.

```bash
git clone https://github.com/HaikeiLabs/agentware
git clone https://github.com/HaikeiLabs/kei-agents
python -m venv .venv && . .venv/bin/activate
pip install -e ./agentware/python -e ./kei-agents
```

TypeScript developers can `npm install @haikeilabs/agentware` (0.7.0 or later),
and Go developers can `go get github.com/soypete/pedro-agentware/go`.

## Step 1: start from a prebuilt agent

kei-agents ships ready-made agents. Pedro is the Discord agent: it files bugs,
searches the wiki and the web, and, for admins, reads and writes GitHub, CRM,
Linear, and Drive. The PDE search agent is a read-only search agent over Drive,
Notion, Gmail, and Tito. Each one is an `AgentDefinition`: a name, a harness, a
set of permissions, a list of tools, and a system prompt shipped inside the
package.

Composing one takes four lines:

```python
from agents import (
    PEDRO_AGENT, ModelFormat, get_agent_tools, load_system_prompt,
    render_tools, validate_agent_definitions,
)

assert validate_agent_definitions([PEDRO_AGENT]) == []
system_prompt = load_system_prompt(PEDRO_AGENT)
tools = render_tools(get_agent_tools(PEDRO_AGENT), ModelFormat.OPENAI)
```

You now have Pedro's prompt and 29 tools in OpenAI function-tool format, ready
for any OpenAI-compatible client. `render_tools` also renders Anthropic and
Ollama formats, or picks the format from a model name.

kei-agents also ships seven workflows (bug to Linear, CRM follow-up, finance,
fundraising, GitHub PR review, leads, support), each with its own prompt and
tool list:

```python
from importlib import resources
from agents import ModelFormat, get_tool_by_name, render_tools
from agents.evals.targets import WORKFLOW_TARGETS

target = next(t for t in WORKFLOW_TARGETS if t.name == "crm_linear_followup")
prompt = resources.files("agents").joinpath(target.prompt_file).read_text(encoding="utf-8")
tools = render_tools([get_tool_by_name(n) for n in target.tools], ModelFormat.OPENAI)
```

Want your own agent? Build an `AgentDefinition` with typed permissions and run
`validate_agent_definitions` in a test. It catches unknown tools, tools whose
permission the agent doesn't hold, and any `*_approve` permission, which is
reserved and never granted to an agent. Note what "valid" means: well formed.
Whether a call is *allowed* is decided later, at run time, by policy.

## Step 2: put a gate in front of every tool

agentware's `AuditedToolClient` wraps your tool functions. Each call goes:
policy decision, audit record, then the tool — only if allowed.

```python
import asyncio
from pedro_agentware.middleware import (
    Action, AuditedToolClient, CallerContext, Policy, Rule, SimplePolicyEvaluator,
)

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
                         func=file_bug, caller=caller)
    try:
        await client.Execute("crm_list_leads", {}, user_id="discord:42", channel_id="chan-1",
                             guild_id=None, func=lambda **a: [], caller=caller)
    except PermissionError as exc:
        print(exc)
    for r in client.records():
        print(r.tool_name, r.decision.action.value, r.invoking_subject)

asyncio.run(main())
```

The bug gets filed. The CRM call raises `PermissionError` ("no matching rules
and default deny is enabled") — and it still shows up in the audit records,
because a denial is an outcome worth recording. Rules match first-wins; they
can also check argument or caller conditions, rate-limit, or redact fields.

### Hand the decision to Kei

A local policy is right for tests. In production you want your workspace
policy to decide, so it can change without a deploy and every decision is
audited centrally. Swap one object:

```python
from pedro_agentware.kei import KeiProxyAuthorizeClient, KeiProxyEvaluator

client.with_policy(KeiProxyEvaluator(KeiProxyAuthorizeClient(executable="kei-proxy", timeout=10.0)))
```

`KeiProxyEvaluator` asks the Kei runtime before each call and **fails
closed**. Only an explicit allow allows. A missing `kei-proxy` binary, an
unset runtime token, a timeout, or a garbled answer all become a deny. Try it
on a laptop with no runtime installed: every call is denied with
`kei-proxy missing_token`. That is the behaviour you want on the day
something breaks.

Two kinds of deny carry a link for the user. An *enrollment* link means the
chat user isn't linked to a Kei user yet. A *connect* link means the tool
needs the user's own account (say, their Linear login) and it isn't connected
or has expired. Either link is single-use. Send it to that one user,
privately, and never log it.

### Keep the human in the record

Agents delegate. An orchestrator spawns a researcher, which spawns a
summarizer, which calls a tool. When the audit log says who made that call, it
should name the person who asked, not "the bot". agentware carries that
person as `invoking_subject` and refuses to let a delegation overwrite it:

```python
child = caller.delegate()   # same invoking_subject, parent_span set, delegation_depth + 1
```

## Step 3: design the tool arguments

Most agent bugs we see are schema bugs, not model bugs. HaikeiLabs writes down
each provider in three parts, and a tool takes its shape from them:

- **Lexicon** — what the provider calls things. This gives you argument
  *names*.
- **Pragmatics** — when an agent should use the tool. This goes in the tool
  *description*: "Use when… Not for…".
- **Semantics** — the entities, their parents, and their key fields. This
  gives you *relationship arguments* and *enum values*.

Three rules follow from Semantics:

1. **A child resource's arguments include its parent's id.** A Linear issue
   lives in a team, so creating one takes `team_id`. A Drive document lives in
   a folder, so creating one takes `folder_id`. A CRM follow-up belongs to a
   lead, so it takes `lead_id`.
2. **Enum values come from the data model.** Severity is
   `critical | high | medium | low`, not free text.
3. **Scope is never an argument.** Tenant, organization, workspace,
   repository, bucket, and drive come from the runtime's credential and the
   connector binding. An agent that can pass `tenant_id` can widen its own
   reach.

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
```

Part 2 shows how to pin all of this down in a test, so the next prompt tweak
can't quietly break it.

## Step 4: register the tool with Kei

Before Kei can decide a call by tool name, an admin loads the tool's scope
(service, action, resource patterns) into the catalog. In agentware 0.7.0 a
tool declares that scope, and the tool registry exports it as a deterministic
JSON manifest. The runtime never registers tools itself. The harness sends
only the tool name, and the catalog works out which resources that covers.

## What this doesn't do

kei-agents has no provider clients and never touches a credential. agentware
decides and audits, but doesn't run your agent loop. Calls to GitHub, Linear,
or Drive run in your environment, through the Kei runtime. Kei itself keeps
only metadata.

**Next:** [Part 2 — test your agent with table-test evals](test-agents-with-table-tests.md).
