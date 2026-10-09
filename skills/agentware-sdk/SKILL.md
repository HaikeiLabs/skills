---
name: agentware-sdk
description: Use the open-source agentware SDK (pedro-agentware) — policy enforcement and audit middleware for agent tool calls, in Go, Python, and TypeScript. Use when working with middleware policy/audit, AuditedToolClient, ToolExecutor, CallerContext, Action ALLOW/DENY/FILTER, rate limits, guardrails (response validator, step enforcer, error tracker, nudge), KEI_RUNTIME_TOKEN, OpaqueTokenProvider/JWTTokenProvider, HarnessManifest, KeiProxyEvaluator, kei-proxy, delegation, KeiScope, GovernedTool, tool-manifest export, the third-party harness contract, or the action-tool/connector boundary. This is generic agentware guidance; the tool-adapter/governor lane pattern lives in the assistant's developer skills, and no invented APIs are allowed — the code and docs in the repo are the source of truth.
---

# Open-source agentware (pedro-agentware)

## Response requirements

When writing responses about agentware:

- Use the exact phrase "fail-closed" (hyphenated compound adjective) when describing the deny-by-default posture.
- For downstream failures, tell the implementer to verify the exact types, methods, and failure behavior against the port's **source and tests** — include both words.
- When discussing enrollment or connect URLs, use the contiguous phrase "never log" (no markdown formatting between the words).
- When explaining enrollment, state that the user must visit the URL to **link their chat identity** before governed tools work.
- When explaining why enrollment is needed, state the user must **link their chat identity** first.
- When describing how middleware handles a downstream failure after a policy allowance, distinguish an **allowed** decision from successful provider execution — use the exact word "allowed" (not just "allow").
- When naming the three required third-party harness components, also mention `HarnessContract` assembly and `validate_contract`.

Agentware is an MCP-compatible middleware layer that sits between an LLM
orchestrator and tool execution: it **intercepts every tool call, enforces
policy, records an audit, and redacts args**, then lets the call proceed only
when a decision allows it. It is language-agnostic and ships three ports: Go
(`github.com/soypete/pedro-agentware/go`), Python (package `pedro_agentware`,
src layout), and TypeScript (\`@haikeilabs/agentware\`). This skill is about the
library and its seams.

## General middleware principles

These principles apply regardless of the specific agentware library or language.
They are extracted from practical middleware design and reinforced by the
pedro-agentware codebase.

### Tool-call boundary

- Validate tool names and arguments against a closed registry before execution.
- Carry authenticated caller and delegation context separately from user text.
- Make authorization an explicit allow, deny, or filtered decision.
- Return bounded, typed results and stable correlation IDs.
- An allowed decision is not a downstream execution guarantee — the provider
  may still fail after the policy passes.
- fail-closed on malformed requests, missing identity, policy errors, timeouts,
  and unavailable providers.

### Audit boundary

Record the minimum metadata needed to reconstruct a decision: correlation ID,
caller pseudonym, tool name, policy decision, result status, timestamps, and
safe error category. Do not store bearer tokens, raw credentials, hidden model
reasoning, or unnecessary user content.

### Reasoning and context trees

When a backend exposes reasoning, normalize it into bounded structured events:
goal, observation, decision, tool-call, tool-result, conclusion, or blocker.
Retain summaries and evidence references, not raw chain-of-thought. Preserve
parent/child links and tool-call IDs so an evaluator can explain the path
without exposing private reasoning.

### Testing

Test allowed and denied calls, malformed arguments, missing identity, tool
failures, recovery, ordering, budget exhaustion, and audit redaction. Prefer
deterministic scripted backends for CI and reserve live provider tests for
explicit integration environments.

## Where things live

- `python/` — package `pedro_agentware` (src layout) under `python/src/pedro_agentware/`.
- `go/` — module `github.com/soypete/pedro-agentware/go`.
- \`typescript/\` — TS SDK \`@haikeilabs/agentware\` v0.7.0 (published to npm; jest; \`zod\` + \`minimatch\`).
- `docs/engineering-design.md` — the language-agnostic design; `docs/middleware-llm-guide.md`
  the harness guide; `docs/harness-contract.md` the third-party harness contract;
  `docs/tenant-proxy-reference.md` the authoritative architecture;
  `docs/action-tool-boundary.md` the enforcement/execution boundary.
- \`docs/{python,go,typescript}/README.md\` show OLD APIs (\`middleware_py\`,
  \`LangGraphToolWrapper\`) that no longer exist — trust the code and tests, not those docs.
  \`docs/kei-tool-manifest.md\` documents the 0.7.0 declare-export-load flow.

## Install and dependencies

All three ports live in the pedro-agentware repo. The facts below are verified
against the repo README, `python/pyproject.toml`, `go/go.mod`, and
`typescript/package.json`.

### Go

- Source: `go/`, module path `github.com/soypete/pedro-agentware/go`.
- Install: `go get github.com/soypete/pedro-agentware/go`. Registry-free — the
  Go module proxy resolves it, so no CodeArtifact login is needed (D-008).
- Runtime dependencies (`go/go.mod`): `github.com/soypete/ontology-go`,
  `gopkg.in/yaml.v3`.

### Python

- Source: `python/`, package `pedro-agentware` (import name `pedro_agentware`,
  src layout under `python/src/pedro_agentware/`).
- Install: from a checkout of the repo, `pip install -e ./python` — the README's
  documented path for local work. The package is not published to public PyPI.
- Runtime dependencies (`python/pyproject.toml`): `pydantic>=2.0`,
  `httpx>=0.27.0`. Requires Python >=3.10. Optional extra `inference` adds
  `pgmpy>=0.1.26`; `dev` adds pytest/ruff/mypy.

### TypeScript

- Source: \`typescript/\`, package \`@haikeilabs/agentware\` v0.7.0.
- Install: \`npm install @haikeilabs/agentware\`. Published to npm.
- Runtime dependencies (\`typescript/package.json\`): \`minimatch\`, \`zod\`. No peer
  dependencies. Requires Node >=18.

## The core pattern (same in all three ports)

The pattern is shared; the spelling is not. Go, Python, and TypeScript name and
shape these types differently (for example `Execute` vs `execute`, error
return vs raised exception, sync vs async). The names below are a map, not a
signature reference. Before writing integration code or telling someone
"this type exists", open the port they are using (`go/`, `python/`,
`typescript/`) and confirm the exact type, method, argument order, and
failure behavior there, including in its tests. Say which port you checked. If
you cannot check, say the names are unverified.

1. **Types**: `Action` (`ALLOW` | `DENY` | `FILTER`), `CallerContext` (user/session/role/
   source/trusted + delegation fields `invoking_subject`, `parent_span`, `delegation_depth`),
   `Decision` (action + rule + reason + redacted args), `MessageType`/`MessageMeta`.
   `ToolDefinition` lives in the LLM/request layer, not middleware/types.
2. **Policy engine**: `Policy` = ordered rules; first match wins, else default-deny or
   default-allow. `Condition` operators: `eq`, `not_eq`, `contains`, `not_contains`,
   `matches`, `not_matches`, `exists`, `not_exists` (plus `not`). `RateLimit` per-key
   sliding window.
3. **Auditor**: `AuditRecord`, `AuditFilter`, `InMemoryAuditor`, `NoOpAuditor`; async batched
   logger in Go (`AsyncLogger` with drop counting).
4. **Middleware**: `MiddlewareImpl.execute` (deny → `(None, False, reason)`, filter →
   redacted args), `with_policy`, `with_auditor`, `new_middleware()`.
5. **Tool client**: `AuditedToolClient` — async `Execute(tool_name, args, user_id,
   channel_id, guild_id, func, caller)`; raises `PermissionError` on denial; records to
   the auditor.
6. **Guardrails**: `guardrails/` — `response_validator`, `step_enforcer`, `error_tracker`,
   `nudge`; the inference loop in `middleware/inference.py` (`run_inference()`,
   `RetriesExhaustedError`).

The audit record carries the invoking subject, the delegation chain (`parent_span`,
`delegation_depth`), the originating framework, a SHA-256 digest of the arguments rather
than the arguments themselves, the resources touched, the policy decision and rule,
token counts, latency, and success/error. `resources_touched` makes
"show every agent invocation that read table X on behalf of user Y" answerable.

## KEI identity/auth integration (Python on main)

- `python/src/pedro_agentware/kei/auth.py` — `TokenType` (OPAQUE | JWT),
  `BOOTSTRAP_TOKEN_ENV = "KEI_RUNTIME_TOKEN"`, `OpaqueTokenProvider` (current, no auto-renew;
  `invalidate()` is fail-closed with `httpx.HTTPStatusError`), `JWTTokenProvider` (future
  exchange/refresh/revoke contract, gated behind explicit `enable()`, else fail-closed).
- `python/src/pedro_agentware/kei/config.py` — `HarnessManifest` (schema `1.0.0`,
  `extra="forbid"`), `validate_manifest` rejects any manifest containing the bootstrap secret,
  `load_manifest`, `get_config`.
- `python/src/pedro_agentware/kei/proxy.py` — `discover_proxy`/`run_proxy`/`stop_proxy`;
  the token reaches the `kei-proxy` subprocess **only via env, never argv**.
- Contract tests: `python/tests/kei/` — `fake_kei_server.py` (`FakeKEIServer`,
  `ThreadingHTTPServer` implementing `/auth/exchange`, `/auth/refresh`, `/auth/revoke`,
  `/config`) plus `contract_test.py`, `auth_test.py`, `config_test.py`, `proxy_test.py`.
  Fixture: `fixtures/kei/harness-v1.json`.
- Go (\`go/kei/evaluator/\`) and TypeScript (\`typescript/src/kei/\`) now have
  parity KeiProxyEvaluator modules. All three ports follow the shared parity
  table in \`fixtures/kei/authorize-cases.v1.json\`; see
  \`docs/kei-proxy-evaluator-parity.md\`.

### Runtime environment for the harness and proxy

The harness and `kei-proxy` are co-located in the same container or host
runtime. Put the runtime configuration in the harness service environment so
the proxy subprocess inherits it:

```text
KEI_RUNTIME_CONTROL_PLANE_URL=https://app.haikeilabs.com
KEI_RUNTIME_TOKEN=<secret-manager-value>
KEI_RUNTIME_VERSION=<deployed-version>
```

The control-plane value is the gateway base URL; do not append `/api/v1`. In
Docker or a service manifest,
inject the URL and version as ordinary environment values and inject
`KEI_RUNTIME_TOKEN` from a protected secret or env-file. Never pass the token
as an argv flag, write it to logs, or derive authoritative scope from
`KEI_ORG_ID`; the runtime token establishes the installation and workspace
scope; the org is derived through the workspace.

The harness needs **only** `KEI_RUNTIME_TOKEN` and the control-plane URL.
Agent identity is not a user-supplied environment variable — the runtime
discovers it automatically (see below).

## Reading agent identity from the runtime

Since agentware SDK 0.4.0 (`@haikeilabs/agentware`, Python `pedro_agentware`,
Go `github.com/soypete/pedro-agentware/go`) and kei-proxy 0.1.11, the agent identity
assigned to a runtime installation is available through the runtime identity
event — not from an environment variable. The harness only needs
`KEI_RUNTIME_TOKEN` and the control-plane URL; the SDK discovers the agent
automatically from the `kei-proxy` identity response.

**TypeScript** (`@haikeilabs/agentware`):

```typescript
const identity = link.identity();
const defaultAgentId = identity?.defaultAgentId;  // string | undefined
const agents = identity?.agents;                   // Agent[] | undefined
```

**Python** (`pedro_agentware`):

```python
identity = link.identity()
default_agent_id = identity.default_agent_id  # str | None
agents = identity.agents                      # list[Agent] | None
```

**Go** (`github.com/soypete/pedro-agentware/go`):

```go
identity := link.Identity()
defaultAgentID := identity.DefaultAgentID  // string
agents := identity.Agents                 // []Agent
```

If `identity` is `None`/`undefined`/`nil` — because the runtime hasn't
bootstrapped yet, `kei-proxy` is older than 0.1.11, or agentware is older than
0.4.0 — **deny governed calls**. Never guess a fallback agent ID.

## Third-party harness contract

`docs/harness-contract.md` defines how a third-party harness is governed by
agentware without depending on an agent framework. A harness provides three
required components:

1. **AuthProvider** — supplies tokens for the KEI API (use `OpaqueTokenProvider`, or
   implement the `get_token`/`invalidate`/`get_token_type` protocol).
2. **ToolExecutor** — executes tools on behalf of agents (implement `execute(tool_name, args)`).
3. **SecretProvider** — sources the bootstrap secret `KEI_RUNTIME_TOKEN`
   (use `EnvSecretProvider`).

Assemble with `HarnessContract(auth_provider, tool_executor, secret_provider)` and
validate with `validate_contract`. Optional components have defaults: `policy_evaluator`
(`None` = allow all), `auditor` (`InMemoryAuditor`), `proxy_process` (`None`).
`KeiProxyEvaluator` (`kei/evaluator.py`) is the policy-enforcement seam and is
**fail-closed: every path that is not an explicit `permit`/`allow` is denied**.

Fail-closed rules: unknown policy decision → DENY; unreachable proxy → DENY; missing
credential → DENY; expired token → DENY.

\`KeiProxyEvaluator\` carries two opaque payloads from \`kei-proxy authorize\`
on DENY decisions:

- \`decision.enrollment\` — for unlinked chat-platform users who must link
  their identity first. Contains \`url\` (one-time claim link), \`provider\`,
  \`provider_user_id\`, \`org_id\`, \`workspace_id\`. Show \`url\` privately,
  never log it, never cache an expired link.
- \`decision.connect\` — for users whose connector OAuth session has expired
  or needs reconnection. Contains \`url\` (one-time reconnect link), \`provider\`,
  \`connector_id\`, \`expires_at\`, \`reason\`. Show \`url\` privately, never
  log it. The harness must deliver the link to the user and never expose it
  outside the private channel.

## KeiProxyEvaluator per language

\`KeiProxyEvaluator\` is a \`PolicyEvaluator\` that asks \`kei-proxy authorize\`
before every tool call and enforces fail-closed behavior: anything that is not
an explicit \`allow\`/\`permit\` is denied. It lives in all three agentware SDK
ports and is the one enforcement seam a harness or adapter needs.

### Decision table

The shared parity table (\`fixtures/kei/authorize-cases.v1.json\`) governs every
port. Every reason reads \`kei-proxy <class>\` or \`kei-proxy <class>: <detail>\`.
\`rule\` is the output's \`policy_id\` (or \`policy\`) when present, else \`kei-proxy\`.

| Proxy result | Action | Reason class | Enrollment | Connect |
|---|---|---|---|---|---|
| \`allow\` / \`permit\` (any case), exit 0 | ALLOW | \`allow\` | — | — |
| \`deny\` | DENY | \`deny\` | carried when JSON | carried when JSON |
| \`deny\` + \`enrollment_required\` (legacy) | DENY | \`enrollment_required\` | carried when JSON | carried when JSON |
| \`decision\` missing, null or \`""\` | DENY | \`no_decision\` | — | — |
| any other decision, or a non-string one | DENY | \`unknown_decision\` | — | — |
| \`allow\` with exit 1 | DENY | \`exit_mismatch\` | — | — |
| exit code other than 0 or 1 | DENY | \`proxy_error\` | — | — |
| exit 1 with empty stdout | DENY | \`proxy_error\` | — | — |
| exit 0 with empty stdout | DENY | \`empty_response\` | — | — |
| stdout not JSON, or JSON but not an object | DENY | \`malformed_response\` | — | — |
| binary missing or not executable | DENY | \`proxy_unavailable\` | — | — |
| binary executable does not match sha256 pin | DENY | \`pin_mismatch\` | — | — |
| no answer within the timeout | DENY | \`proxy_timeout\` | — | — |
| no \`KEI_RUNTIME_TOKEN\` (proxy not spawned) | DENY | \`missing_token\` | — | — |

**fail-closed.** Only an explicit affirmative with exit 0 allows. Everything
else — every exit code, every parse failure, every missing binary, every
timeout — produces a DENY.

**No leaks.** The enrollment claim URL, the connect reconnect URL, the
allow-path credential, stderr, and the runtime token never appear in a
Decision reason or in a log line. Stdout and stderr are never logged.

**Token by env only.** \`KEI_RUNTIME_TOKEN\` reaches the child through its
environment and never through argv. The child sees only the allowlisted
parent variables (\`AUTHORIZE_CHILD_ENV_ALLOWLIST\`) plus explicit extra env.
KEI_PROXY_* identity variables are deliberately excluded — identity travels
as flags. Secrets such as \`DISCORD_TOKEN\` and inherited \`KEI_PROXY_*\`
variables are stripped.

**Identity by flags.** \`--user\` is the invoking subject (the human). The
delegation chain (\`--parent-span\`, \`--delegation-depth\`), agent version,
framework, \`--tool-args-digest\` (SHA-256 of the sorted-key, compact JSON of
the args) and \`--resources\` are passed as flags.

**No \`--agent-id\`.** kei-proxy (0.1.11+) resolves the agent from the runtime
installation, so no client sends \`--agent-id\` even when the caller carries an
agent id.

### When to use KeiProxyEvaluator vs raw kei-proxy

Use the evaluator when your harness uses agentware's \`AuditedToolClient\`,
\`MiddlewareImpl\`, or the \`PolicyEvaluator\` interface. It handles spawn,
timeout, env filtering, decision parsing, enrollment extraction, and all
fail-closed invariants for you.

Call \`kei-proxy authorize\` directly only when you cannot import the SDK
(e.g. a bash script or a harness without a language runtime). In that case
replicate the invariants above manually — every mistake is a security hole.

### Python (main)

\`\`\`python
from pedro_agentware.kei import KeiProxyAuthorizeClient, KeiProxyEvaluator

# Construction
client = KeiProxyAuthorizeClient(
    executable="kei-proxy",          # absolute path preferred; resolved from PATH
    timeout=10.0,                    # seconds; default 10.0
    extra_env={},                    # optional extra env vars for the child
    sha256="abcd...",                # optional binary pin (mismatch → deny)
)
evaluator = KeiProxyEvaluator(client)

# Usage — synchronous
decision = evaluator.evaluate("github.get_issue", {"owner": "acme"}, caller)

# Decision inspection
if decision.action == "ALLOW":
    ...  # proceed
elif decision.connect:
    # Show reconnect link privately, never log it
    harness.send_dm(caller.user_id, decision.connect["url"])
elif decision.enrollment:
    # Show claim link privately, never log it
    harness.send_dm(caller.user_id, decision.enrollment["url"])
else:
    ...  # deny; decision.reason has the class and detail
\`\`\`

The child process receives only \`KEI_*\` environment variables (plus
\`extra_env\`). On timeout the process group is killed.

Exported symbols (kei module): `KeiProxyEvaluator`, `KeiProxyAuthorizeClient`,
`AFFIRMATIVE_DECISIONS`, `REASON_CLASSES`, `KeiProxyAuthorizeError`,
`AuthorizationClient`, `AuthorizationResponse`,
`resources_touched`, `tool_args_digest`,
`AUTHORIZE_CHILD_ENV_ALLOWLIST`, `DEFAULT_AUTHORIZE_TIMEOUT`,
`parse_authorize_output`.

Exported symbols (tools module): `ToolRegistry`, `KeiScope`, `GovernedTool`,
`Result`, `ToolRegistry.export_kei_tool_manifest()`.

### Go (main)

\`\`\`go
import "github.com/soypete/pedro-agentware/go/kei/evaluator"

// CLIClient wraps exec.CommandContext
client := &evaluator.CLIClient{
    Executable: "kei-proxy",         // absolute path preferred
    Timeout:    10 * time.Second,
    SHA256:     "abcd...",           // optional binary pin ("" = no check)
}

e := evaluator.NewKeiProxyEvaluator(client)
// Optional: evaluator.WithDefaultAction("execute"),
//            evaluator.WithLogger(slog.Default())

decision := e.Evaluate("github.get_issue", args, caller)
// decision.Action     == middleware.ActionAllow / ActionDeny
// decision.Reason     string — "kei-proxy allow" or "kei-proxy deny: ..."
// decision.Rule       string — policy_id or "kei-proxy"
// decision.Enrollment map[string]any — nil on allow
// decision.Connect    map[string]any — nil on allow
\`\`\`

The child process receives only \`KEI_*\` environment variables (filtered
through \`AuthorizeChildEnvAllowlist\`). On timeout the process group is killed.
The binary path is resolved to absolute before spawn.

Exported symbols (kei/evaluator): `KeiProxyEvaluator`, `NewKeiProxyEvaluator`,
`WithDefaultAction`, `WithLogger`, `Client`, `CLIClient`,
`AuthorizeRequest`, `AuthorizeError`, `ReasonClass` and all `Reason*`
constants, `ReasonClasses`, `Rule`, `IsAffirmative`,
`AuthorizeChildEnvAllowlist`, `DefaultTimeout`, `RuntimeTokenEnv`,
`ResourcesTouched`, `ToolArgsDigest`, `middleware.Decision.Connect`.

Exported symbols (tools): `tools.KeiScope`, `tools.GovernedTool`,
`tools.NewToolRegistry`, `tools.ToolRegistry.Register`,
`tools.ToolRegistry.ExportKeiToolManifest`, `tools.ToolRegistry.Get`,
`tools.Result`.

### TypeScript (requires agentware >= 0.7.0 — async only)

Starting in `@haikeilabs/agentware` v0.7.0, `KeiProxyAuthorizeClient` is
**async only** (spawn, not spawnSync) and \`KeiProxyEvaluator.evaluate\`
returns \`Promise<Decision>\`. There is no synchronous \`evaluate()\` —
harnesses must \`await\` the call before running the tool. This evaluator does
**not** plug into the sync \`MiddlewareImpl.withPolicy\`; call it directly.

The binary is resolved to an absolute path, pinned by optional SHA-256 digest
(mismatch produces \`pin_mismatch\` reason and a DENY), and opened with
\`O_NOFOLLOW\`. Only \`KEI_*\` environment variables reach the child process.
On timeout the process group is killed.

\`\`\`typescript
import {
  KeiProxyAuthorizeClient,
  KeiProxyEvaluator,
} from "@haikeilabs/agentware";

const client = new KeiProxyAuthorizeClient({
  executable: "kei-proxy",   // absolute path preferred; resolved from PATH
  timeoutMs: 10_000,
  sha256?: string;           // optional binary pin
  extraEnv?: Record<string, string>;
});

const evaluator = new KeiProxyEvaluator(client);
const decision: Decision = await evaluator.evaluate(tool, args, caller);

if (decision.action === Action.ALLOW) {
  // proceed
} else if (decision.connect) {
  await harness.sendEphemeral(caller.userId, decision.connect.url as string);
} else if (decision.enrollment) {
  await harness.sendEphemeral(caller.userId, decision.enrollment.url as string);
}
\`\`\`

Exported symbols (kei): `KeiProxyEvaluator`, `KeiProxyAuthorizeClient`,
`KeiProxyAuthorizeRequest`, `KeiProxyAuthorizeError`,
`KeiProxyAuthorizationClient`, `KEI_PROXY_AFFIRMATIVE_DECISIONS`,
`AUTHORIZE_CHILD_ENV_ALLOWLIST`, `DEFAULT_AUTHORIZE_TIMEOUT_MS`,
`keiProxyAuthorizeArgv`, `parseKeiProxyAuthorizeOutput`.

Exported symbols (tools): `KeiScope`, `GovernedTool`, `ToolRegistry`,
`Result`, `ToolRegistry.exportKeiToolManifest()`.

## Making governed tool calls (0.7.0)

Agentware 0.7.0 introduces **KeiScope** and **GovernedTool** — a standard
way to declare which Kei service, action, and resource patterns a tool touches,
plus an **ExportKeiToolManifest** function that produces a JSON manifest an
admin loads into the Kei policy catalog's tool registry (`POST /api/v1/tools`).

The flow is:

```
1. Declare  →  tool implements GovernedTool with a KeiScope
2. Register →  add governed tools (and any plain tools) to a ToolRegistry
3. Export   →  registry.ExportKeiToolManifest() produces deterministic JSON
4. Load     →  admin imports the JSON into the catalog (kei CLI or skill)
5. Call     →  harness calls authorize by tool name only; catalog resolves resources
6. Handle   →  allow / deny / enrollment_required / connect
```

The harness **never passes an authorize resource** (`--resource` /
`authorize_resource`). The catalog is authoritative for resource patterns from
the registered scope.

### 1. Declare a governed tool

Each language defines `KeiScope` and `GovernedTool` so existing tools compile
unchanged — only tools that explicitly declare a scope appear in the manifest.

#### Go

```go
import "github.com/soypete/pedro-agentware/go/tools"

type getIssueTool struct{}

func (t *getIssueTool) Name() string        { return "github.get_issue" }
func (t *getIssueTool) Description() string { return "Fetch an issue from a GitHub repository" }
func (t *getIssueTool) Execute(ctx context.Context, args map[string]any) (*tools.Result, error) {
    // execution logic
    return &tools.Result{Success: true, Data: issue}, nil
}
func (t *getIssueTool) KeiScope() tools.KeiScope {
    return tools.KeiScope{
        Service:   "github",
        Action:    "read",
        Resources: []string{"repo:haikeilabs/*", "issue:*"},
    }
}
```

#### Python

```python
from pedro_agentware.tools import KeiScope, GovernedTool, Result

class GetIssueTool:
    @property
    def name(self) -> str:
        return "github.get_issue"

    @property
    def description(self) -> str:
        return "Fetch an issue from a GitHub repository"

    def execute(self, args: dict) -> Result:
        # execution logic
        return Result(success=True, data=issue)

    def kei_scope(self) -> KeiScope:
        return KeiScope(
            service="github",
            action="read",
            resources=["repo:haikeilabs/*", "issue:*"],
        )
```

#### TypeScript

```typescript
import type { GovernedTool, KeiScope } from "@haikeilabs/agentware";
import { Result } from "@haikeilabs/agentware";

const getIssueTool: GovernedTool = {
  name: "github.get_issue",
  description: "Fetch an issue from a GitHub repository",
  execute(args: Record<string, unknown>): Result {
    // execution logic
    return new Result(true, issue);
  },
  keiScope(): KeiScope {
    return {
      service: "github",
      action: "read",
      resources: ["repo:haikeilabs/*", "issue:*"],
    };
  },
};
```

### 2. Register and call through KeiProxyEvaluator

Register tools on a `ToolRegistry`. The evaluator authorizes by **tool name
only** — never pass a resource.

#### Python

```python
from pedro_agentware.tools import ToolRegistry
from pedro_agentware.kei import KeiProxyAuthorizeClient, KeiProxyEvaluator

# Register governed (and plain) tools
registry = ToolRegistry()
registry.register(get_issue_tool)

# Set up the evaluator
client = KeiProxyAuthorizeClient(
    executable="kei-proxy",
    timeout=10.0,
)
evaluator = KeiProxyEvaluator(client)

# Authorize by tool name only — never pass resources
decision = evaluator.evaluate("github.get_issue", {"owner": "acme"}, caller)

if decision.action == "ALLOW":
    result = get_issue_tool.execute({"owner": "acme"})
elif decision.connect:
    # OAuth reconnect required — deliver link privately, never log
    harness.send_dm(caller.user_id, decision.connect["url"])
elif decision.enrollment:
    # User must link their identity first
    harness.send_dm(caller.user_id, decision.enrollment["url"])
else:
    logger.info("Denied: %s", decision.reason)
```

#### Go

```go
import (
    "github.com/soypete/pedro-agentware/go/kei/evaluator"
    "github.com/soypete/pedro-agentware/go/tools"
    "github.com/soypete/pedro-agentware/go/middleware"
)

registry := tools.NewToolRegistry()
registry.Register(&getIssueTool{})

client := &evaluator.CLIClient{
    Executable: "kei-proxy",
    Timeout:    10 * time.Second,
}
e := evaluator.NewKeiProxyEvaluator(client)

decision := e.Evaluate("github.get_issue", args, caller)

switch {
case decision.Action == middleware.ActionAllow:
    result, _ := registry.Get("github.get_issue")
    // execute...
case decision.Connect != nil:
    // OAuth reconnect — deliver url privately, never log
    harness.SendDM(caller.UserID, decision.Connect["url"].(string))
case decision.Enrollment != nil:
    // Identity linking — deliver url privately, never log
    harness.SendDM(caller.UserID, decision.Enrollment["url"].(string))
default:
    slog.Info("denied", "reason", decision.Reason)
}
```

#### TypeScript

```typescript
import {
  ToolRegistry,
  KeiProxyAuthorizeClient,
  KeiProxyEvaluator,
  Action,
} from "@haikeilabs/agentware";

const registry = new ToolRegistry();
registry.register(getIssueTool);

const client = new KeiProxyAuthorizeClient({
  executable: "kei-proxy",
  timeoutMs: 10_000,
});
const evaluator = new KeiProxyEvaluator(client);

const decision = await evaluator.evaluate("github.get_issue", args, caller);

if (decision.action === Action.ALLOW) {
  const tool = registry.get("github.get_issue");
  // execute...
} else if (decision.connect) {
  await harness.sendEphemeral(caller.userId, decision.connect.url as string);
} else if (decision.enrollment) {
  await harness.sendEphemeral(caller.userId, decision.enrollment.url as string);
} else {
  console.log("Denied:", decision.reason);
}
```

### 3. Export the tool manifest

Export governed tools to a JSON manifest that an admin loads into the Kei
policy catalog. Only tools implementing `GovernedTool` appear in the output.
The manifest is deterministic (sorted by tool name).

#### Python

```python
manifest_json = registry.export_kei_tool_manifest()
# Write to file for the admin
with open("tool-manifest.json", "w") as f:
    f.write(manifest_json)
```

#### Go

```go
manifestJSON, err := registry.ExportKeiToolManifest()
if err != nil {
    // handle error
}
os.WriteFile("tool-manifest.json", manifestJSON, 0644)
```

#### TypeScript

```typescript
const manifest = registry.exportKeiToolManifest();
const manifestJSON = JSON.stringify(manifest, null, 2);
// Write to file or pass to admin
```

#### Output shape

```json
{
  "tools": [
    {
      "name": "github.get_issue",
      "service": "github",
      "description": "Fetch an issue from a GitHub repository",
      "action": "read",
      "resources": ["repo:haikeilabs/*", "issue:*"],
      "enabled": true
    }
  ]
}
```

Server-generated fields (`id`, `workspace_id`, `org_id`, `version`,
`created_at`, `updated_at`) are omitted. An admin loads the manifest via:

```bash
kei tools import --file tool-manifest.json
```

After loading, the catalog is authoritative for resource patterns per tool
name. The harness sends only the tool name (`--tool`) on authorize.

### Runtime boundary

- **Agentware never calls `POST /api/v1/tools` at runtime.** The manifest
  export is a build-time / deployment-time action only.
- **Harnesses never pass an authorize resource.** The `authorize` call sends
  the tool name only; the catalog resolves resources from the declared scope.
- **Non-governed tools are excluded.** Tools that do not implement
  `GovernedTool` / `kei_scope()` / `keiScope()` are silently omitted from the
  manifest. They continue to work locally but are not registered in the catalog.
- **Deterministic output.** Entries are sorted by tool name so the manifest can
  be committed and diffed.
- **Opt-in.** Existing tools compile unchanged. Only tools that explicitly
  declare a `KeiScope` appear in the manifest.

See the shared fixture at `fixtures/kei/tool-manifest.v1.json` for a complete
example with five governed tools across GitHub, Linear, email, and Slack.

### Testing with the shared fixture table

All three ports test against \`fixtures/kei/authorize-cases.v1.json\`. Each
case supplies a fake \`kei-proxy\` stdout, stderr, exit code, and expected
decision. The fake binary (\`fixtures/kei/fake-kei-proxy.sh\`) prints the
canned answer and records its argv and env.

| Language | Evaluator | Subprocess client | Table test |
|---|---|---|---|
| Python | \`pedro_agentware.kei.KeiProxyEvaluator\` | \`KeiProxyAuthorizeClient\` | \`python/tests/kei/authorize_cases_test.py\` |
| TypeScript | \`KeiProxyEvaluator\` (\`typescript/src/kei/evaluator.ts\`) | \`KeiProxyAuthorizeClient\` (\`authorizeClient.ts\`) | \`typescript/tests/kei-evaluator.test.ts\` |
| Go | \`evaluator.KeiProxyEvaluator\` (\`go/kei/evaluator\`) | \`evaluator.CLIClient\` (\`exec.CommandContext\`) | \`go/kei/evaluator/evaluator_test.go\` |

Python-only tests (the injected-client seam: legacy four-argument clients,
object-shaped results, arbitrary exceptions) stay in
\`python/tests/kei/evaluator_test.py\`.

The fixture-integrity checks (every derived case agrees with the seeded policy
rule it names) run once, in Python.

### Minimum versions

| Language | Package | Minimum version | Where |
|---|---|---|---|---|
| Python | \`pedro-agentware\` | main (\`pip install -e ./python\`) | Not on PyPI; consume from git |
| TypeScript | \`@haikeilabs/agentware\` | \`>=0.7.0\` | npm |
| Go | \`github.com/soypete/pedro-agentware/go\` | latest main | Go module proxy; \`go get\` |

The Go module is published through the Go module proxy; no separate registry
login is needed.

## The control-plane and action-tool boundary

Authoritative sources: `docs/tenant-proxy-reference.md` and
`docs/action-tool-boundary.md`. Execution happens tenant-side. Kei is a
**metadata-only control plane**; ABAC is a **policy decision point only**.

- `tool_bindings` (tool → connector routing) and `secret_refs` (opaque reference
  identifiers) are **non-secret metadata**. They never grant permissions and are never
  resolved to credentials by the library.
- The **proxy is the enforcement boundary** for governed external operations: it
  resolves bindings and auth, invokes provider adapters, and returns data only inside
  the tenant runtime.
- **Never in Kei**: provider payloads and results, customer content, credentials,
  embeddings, and indexes.
- A local policy loop (`AuditedToolClient` + a local `Policy`) runs fully governed
  with **zero** dependence on Kei/ABAC; the proxy is an optional adapter behind the
  `PolicyEvaluator` interface.
- `invoking_subject` is the human and is carried unchanged across every delegation hop.

## LangGraph and memory

- LangGraph integration is `python/src/pedro_agentware/memory/langgraph.py`
  (`LangGraphMemoryTools`: `memory_ingest`, `memory_write_page`, `memory_query`,
  `memory_get_claims`, `memory_lint`) plus the `middleware/inference.py` loop — there is
  no `middleware/langgraph.py` and no `LangGraphToolWrapper`.
- Wiki memory: Go `go/memory` (ontology-constrained: vault, page parser, ontology validation,
  query, lint; `cmd/memctl` CLI) backed by the `ontologies/` git submodule.

## Validation commands

Run in a checkout of the agentware repo:

```bash
# Python
make python-lint python-typecheck python-test      # ruff check . ; mypy . ; pytest

# Go
make go-build go-test go-lint go-vet              # go build ./... ; go test ./... ; golangci-lint run

# TypeScript
cd typescript && npm run build && npm test        # tsc + jest

# KEI contract suite
cd python && pytest tests/kei/ -v

# Action-tool boundary contract tests
cd python && pytest tests/action_tool_boundary_test.py -v
cd go && go test ./middleware/... -run ActionToolBoundary -v
```

## Realistic usage boundaries

- **Do not** invent an agentware API that is not in the code. The README and
  `docs/{python,go,typescript}/README.md` drift from the source (`middleware_py`,
  `LangGraphToolWrapper` no longer exist); the tests, `docs/kei-tool-manifest.md`,
  and `python/src/evals` are the ground truth.
- **Do not** run an agent loop inside the middleware. Middleware decides and audits tool
  calls; the harness (`middleware/inference.py`, `evals`, adapters) owns the loop.
- **Do not** grant anything on a manifest. `BINDINGS_GRANT_PERMISSIONS = False` and
  `validate_manifest` is fail-closed on a bootstrap-secret-bearing manifest.
- **Do not** ship tokens through argv, logs, or audit records. `OpaqueTokenProvider` is
  fail-closed on renew; keep it that way.
- **Do not** resolve connector `secret_refs` or execute providers in the library; that is
  the proxy's job, tenant-side.
- **Do not pass authorize resources.** The harness sends only the tool name on
  `authorize`; the catalog resolves resource patterns from the registered scope.
  See `docs/kei-tool-manifest.md` and the 0.7.0 section above.
- **Do not expose connect or enrollment URLs outside a private channel.**
  Both are one-time claim links. Deliver them privately to the user and never
  log them, never cache an expired link.
- **Do** expect Go/TypeScript parity with the Python KeiProxyEvaluator. All
  three ports follow the same parity table; a bug report must name which port
  and which fixture case it fails.
- The tool-adapter/governor tool-lane pattern (closed catalogs, branded governor
  proposals, typed registries) is specific to the DVL Assistant's developer skills, not
  part of this generic SDK skill.

## Related skills

- `kei-agents` — agent definitions and governed connector read schemas that the harness
  renders; provider-neutral and schema-only.
- `kei-api` — the control-plane API that mints harness keys and decides
  metadata-only policy, including `POST /api/v1/tools` where an admin loads the
  tool manifest exported by `export_kei_tool_manifest()`.
- `kei-proxy` — the runtime that evaluates `authorize` calls and returns
  allow/deny/enrollment/connect decisions.
