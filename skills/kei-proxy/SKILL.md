---
name: kei-proxy
description: "The `kei-proxy` runtime executable (kei-connector-runtime) — what an agent harness calls at run time to get a governed decision: `kei-proxy authorize` before a tool call (one-shot CLI), `kei-proxy serve` to run as a long-lived daemon exposing HTTP over a Unix socket (readiness, model routes; governed authorize route tracked by HAI-272), `connector invoke` for governed data, `runtime bootstrap|heartbeat`, `collector` for audit shipping, `model`, and `credential sync`. Load whenever code or config in a harness, adapter, container, or agent calls kei-proxy, sets KEI_RUNTIME_* or KEI_PROXY_* variables, reads its exit codes or JSON, or someone asks how an agent's tool call gets allowed or denied by Kei. Not for platform administration (logins, installations, credentials) — that is the `kei` CLI (kei-cli skill)."
---

# kei-proxy (runtime for agent interaction)

Kei has two executables. Mixing them up is the most common mistake, so
settle which one a task needs before anything else:

| | `kei` — platform admin CLI | `kei-proxy` — runtime |
| --- | --- | --- |
| Who runs it | A person: org `owner`/`admin`, on a workstation | The harness, as a one-shot CLI subprocess per operation OR as a long-running daemon (`kei-proxy serve`) over a Unix socket |
| Authenticates with | `kei login` device flow → CLI token in the OS keychain | `KEI_RUNTIME_TOKEN` (runtime credential only) from the environment |
| Talks to | The control plane's admin APIs | The control plane's runtime APIs, plus local secret stores and providers |
| Jobs | Log in, create/inspect/bind/delete runtime installations, emit/rotate runtime credentials | Decide allow/deny for a tool call, run allowed connector work locally, bootstrap + heartbeat, ship audit, serve readiness + model endpoints over a Unix socket (daemon mode) |
| Lives | Operator's laptop | Same host or container as the harness (same-host daemon on bare metal, same-container daemon in Docker); optional same-pod companion container on Kubernetes |
| Skill | `kei-cli` | this one |

An agent never runs `kei login` or `kei bot …` to do its work, and a person
never needs `kei-proxy authorize` to administer the platform. `kei setup` and
`kei runtime bootstrap` are the one bridge: admin-CLI conveniences that write
local runtime config and shell out to `kei-proxy` to check it.

## Governed vs non-governed tool calls

Not every tool call a harness makes is governed. The rule is simple: **anything
that touches tenant data, external systems, or credentials is governed**;
everything else is local.

- **Governed** — the call goes through `kei-proxy authorize` (or the agentware
  `KeiProxyEvaluator`, which wraps it — see the `agentware-sdk` skill). Kei
  policy decides allow or deny, the decision is audited, and enrollment or
  approval can apply before the tool runs.
- **Non-governed** — the call runs locally in the harness and never reaches
  Kei. No policy check, no audit event.

When unsure whether a tool is governed, treat it as governed and route it
through `kei-proxy authorize`. A tool is not governed just because the adapter
exposes it, and a local call is not safe just because it never reaches Kei.

Your knowledge of `kei-proxy` subcommands may be outdated. **Prefer retrieval.**

## Retrieval sources

| Source | How to retrieve | Use for |
| --- | --- | --- |
| Installed binary | `kei-proxy help`, `kei-proxy <command> --help` | Commands, flags, env vars for this version |
| Console: Configure the tenant-side proxy | `https://app.haikeilabs.com/#/docs/add-a-workspace` | Runtime env, bootstrap output, container build |
| Console: Runtime installations | `https://app.haikeilabs.com/#/docs/add-a-workspace` | Runtime env, bootstrap output, container build |
| Console: Audit logs | `https://app.haikeilabs.com/#/docs/groups-policies-users` | `collector` |
| Source | `HaikeiLabs/kei-connector-runtime` (private): `main.go` usage | Ground truth |
| Socket contract | [`docs/unix-socket.md`](https://github.com/HaikeiLabs/kei-connector-runtime/blob/main/docs/unix-socket.md) in the runtime repo | Socket path, lifecycle, auth, current vs future routes |

## FIRST: confirm it is present and configured

```sh
kei-proxy --version
kei-proxy help
```

It must be on the same host or in the same image as the harness. On a
workstation it is installed alongside `kei` by the release installer
(kei-cli v0.1.4+). For containers, build it from the Kei repo (see
`kei-runtime-setup`; no public image is published).

On a workstation you normally don't bootstrap with `kei-proxy` directly:
`kei setup` stores the settings and `kei runtime bootstrap` runs
`kei-proxy runtime bootstrap` for you. Call `kei-proxy` directly in deployed
runtimes, and always for the per-call commands below.
The harness process needs, in its environment:

```text
KEI_RUNTIME_CONTROL_PLANE_URL=https://YOUR_KEI_GATEWAY   # no /api/v1 suffix
KEI_RUNTIME_TOKEN=<runtime credential from the secret manager>  # never an argument
KEI_RUNTIME_VERSION=<runtime version>
```

When running in daemon mode (`kei-proxy serve`), the socket path defaults to
`/run/kei-proxy/runtime.sock` and can be overridden with `KEI_RUNTIME_SOCKET_PATH`.
The daemon also accepts `KEI_PROXY_LISTEN_ADDR` (TCP, default `:8085`) for
existing same-container deployments. See `docs/unix-socket.md` in the runtime
repo for the full socket contract.

The token determines installation, organization, and workspace scope. Do not
pass org, tenant, or workspace IDs as scope. `--key` exists on some commands
but puts the token in the process list and shell history; use the env var.

**Agent identity is auto-discovered.** Since kei-proxy 0.1.11 the identity
event (whoami) returns the assigned agent ID and agent list. The harness does
not need `KEI_PROXY_AGENT_ID` or any agent-ID environment variable. If you
use the agentware SDK (>= 0.4.0), call `link.identity()` (see
`agentware-sdk` skill). When calling `kei-proxy authorize` directly, omit
`--agent-id` — the runtime resolves it from the installation.

There is one credential — the runtime installation credential (`KEI_RUNTIME_TOKEN`)
from **Create installation** or `kei bot credential`. The **Keys** page no longer
exists; agent keys were deprecated in favor of the installation credential for
all runtime operations.

## Quick reference

| Task | Command |
| --- | --- |
| Decide a tool call (and fetch its credential on allow) | `kei-proxy authorize --user U --tool T --action A --resource R` |
| Invoke a governed data connector | `kei-proxy connector invoke --connector ID --capability C --action A --resource R [--idempotency-key KEY]` |
| Verify installation + first heartbeat | `kei-proxy runtime bootstrap` |
| Keep liveness current | `kei-proxy runtime heartbeat --interval 1m` |
| Ship local audit JSONL | `kei-proxy collector [--poll --poll-interval 1m]` |
| Sync credential-store metadata | `kei-proxy credential sync` |
| Model profile / invocation | `kei-proxy model profile …`, `kei-proxy model  # uses runtime identity (no key flag needed)` (request JSON on stdin) |
| Long-running daemon (Unix socket + optional TCP) | `kei-proxy serve` (`KEI_RUNTIME_SOCKET_PATH`, default `/run/kei-proxy/runtime.sock`; TCP on `KEI_PROXY_LISTEN_ADDR`, default `:8085`, for existing Docker same-container deployments). Current socket routes: `GET /healthz`, `GET /readyz`, `GET /v1/models`, `POST /v1/chat/completions`. Governed tool authorize route tracked by HAI-272. See `docs/unix-socket.md`. |

`kei-proxy org` and `kei-proxy init` also exist. They call the Kei API
directly with a service secret and are Haikei-internal provisioning tools, not
part of a customer harness. Don't wire them into an agent.
## authorize: the per-call decision

> **If your harness uses the agentware SDK**, prefer `KeiProxyEvaluator`
> (see `agentware-sdk` skill) over calling `kei-proxy authorize` directly.
> The evaluator handles spawn, timeout, env filtering, decision parsing,
> enrollment extraction, and all fail-closed invariants. This reference is
> for direct calls when you cannot use the SDK.

The adapter calls this before every governed tool runs and obeys the
result:

```sh
kei-proxy authorize --user "$SUBJECT" --tool github.create_pr \
  --action github:write --resource repo:acme/widgets
```

- **stdout** is a JSON decision (including `decision`); on allow it carries
  what the tool needs from the configured secret store.
- **Exit code** `0` = allow. Non-zero = do not run the tool: `1` for a deny,
  and also for any error (bad config, unreachable control plane, stale
  policy). Treat every non-zero exit as a deny — that is what fail-closed means
  here.
- **stderr** gets a structured audit event; with `KEI_PROXY_AUDIT` set, the
  decision is also appended to that JSONL file for `collector`.

### Disabling kei-proxy denies every governed tool call

`KEI_PROXY_DISABLED=true` is a valid setting, but it turns permits off: a
disabled, missing, or misconfigured kei-proxy is a **deny on every governed
call** (fail-closed, HAI-249). It never permits a tool call. Tests that need an
allow inject a fake evaluator instead of relying on a disabled proxy (see the
`agentware-sdk` skill for the evaluator and its test fixtures). A production
harness should not run with kei-proxy disabled — every governed tool would be
denied.

### Enrollment in the authorize response

When a chat-platform user (Teams, Slack, Discord) is not yet linked to a Kei
user, `kei-proxy authorize` exits with code `1` (deny) and the JSON on stdout
carries `decision: "deny"` with an `enrollment` object passed through from the
catalog:

```json
{
  "decision": "deny",
  "reason": "provider identity is not linked to a kei user",
  "enrollment": {
    "provider": "teams",
    "provider_user_id": "user@domain.com",
    "org_id": "uuid",
    "workspace_id": "uuid",
    "url": "https://app.haikeilabs.com/identity/link#claim=abc123...",
    "expires_at": "2026-09-28T12:00:00Z"
  }
}
```

**Detect enrollment by the presence of `enrollment` on a deny**, not by
`decision == "enrollment_required"`. The catalog itself returns
`enrollment_required` (see `kei-api`), but kei-proxy maps that to `deny` and
passes the `enrollment` object through unchanged.

The harness must show `url` privately to the user (ephemeral message or DM),
never log it. `url` and `expires_at` may be absent when the control plane
cannot issue a claim (no workspace scope, no `KEI_WEB_BASE_URL`). The user
visits the link to self-enroll; the next authorize call then returns `allow`
or policy-driven `deny`. See `kei-harness-setup` section 6 for the full
enrollment flow and `kei-api` for the endpoint contract.

Identity and delegation come from flags or environment:

| Env | Flag | Meaning |
| --- | --- | --- |
| `KEI_PROXY_INVOKING_SUBJECT` | `--invoking-subject` | The human who started the task (defaults to `--user`); keep it through subagent hops |
| `KEI_PROXY_FRAMEWORK` | `--framework` | Harness, e.g. `claude`, `codex` |
| `KEI_PROXY_SPAN_ID` / `KEI_PROXY_PARENT_SPAN` / `KEI_PROXY_DELEGATION_DEPTH` | `--span-id` / `--parent-span` / `--delegation-depth` | Delegation chain; span ID is the dedupe key |
| `KEI_PROXY_TOOL_ARGS_DIGEST` | `--tool-args-digest` | SHA-256 of the tool args — never the raw args |
| `KEI_PROXY_REGISTRY` | `--registry` | Tool → service registry (default `/data/config/tools.yaml`) |

**Agent ID is auto-discovered** — the proxy resolves it from the runtime
identity event. Do not set `KEI_PROXY_AGENT_ID` or pass `--agent-id`; omit
them. (The flag and env var still exist on older kei-proxy builds but are
neither required nor recommended with >= 0.1.11.)

Never put a tenant, org, or workspace ID into agent-controlled tool
parameters, and never log the credential `authorize` returns.

## connector invoke

For governed data connectors. Per ADR-027, per-call approval is removed;
approvals now grant workspace access, not per-call permission. The
`--approval-id` flag is no longer available. Pass `--idempotency-key`
for retried writes.

## Runtime modes: one-shot CLI vs daemon

`kei-proxy` supports two modes. Understand which one a task needs before
writing config or code:

| Mode | Invocation | Listener | Governed authorize | Harness integration |
| --- | --- | --- | --- | --- |
| **One-shot CLI** (default) | `kei-proxy authorize ...` per call | None; spawned per call, reads decision from stdout+exit code | Yes — current production path. Agentware `KeiProxyEvaluator` / `KeiProxyAuthorizeClient` spawn the CLI subprocess. | Simplest: harness execs the binary and parses JSON. No listener management needed. |
| **Daemon** (opt-in) | `kei-proxy serve` (long-lived) | Unix socket (`KEI_RUNTIME_SOCKET_PATH`, default `/run/kei-proxy/runtime.sock`) + optional TCP (`KEI_PROXY_LISTEN_ADDR`) | **Not yet.** The daemon currently exposes readiness (`GET /healthz`, `GET /readyz`) and model routes (`GET /v1/models`, `POST /v1/chat/completions`). A governed tool `POST /v1/authorize` on the socket is tracked by [HAI-272](https://linear.app/haikeilabs/issue/HAI-272) (blocked on HAI-124 local-PDP contract). Agentware harnesses still spawn the CLI subprocess for tool authorize. | Same-host daemon (bare metal) or same-container daemon (Docker); optional same-pod companion container on Kubernetes. Shares a tmpfs volume for the socket file. No TLS — access control is socket file mode 0600 and UID matching. |

The current (HAI-201, PR #40) socket contract is documented in
[`docs/unix-socket.md`](https://github.com/HaikeiLabs/kei-connector-runtime/blob/main/docs/unix-socket.md).
A draft daemon-socket authorize route (PR #65) was closed because it forwarded
decisions to the catalog `/api/v1/authorize` and accepted an unauthenticated
caller-subject — incompatible with ADR-011 (local PDP) and HAI-124 (caller
identity contract). HAI-272 will supersede it with a local-PDP-backed socket
authorize API and corresponding Agentware/harness migration.

Until HAI-272 ships, treat `kei-proxy authorize` (the CLI subprocess) as the
production path for governed tool decisions. Do not wire harnesses to call
authorization over the socket, and do not describe the socket authorize route
as available or describe the local-PDP migration as complete.

## ADR-011 target: local PDP (not yet implemented)

The one-shot CLI path above is the **present-day** production behavior.
ADR-011's target is a tenant-side **local PDP** in the runtime. When it ships,
the runtime will:

- Make the allow/deny decision **locally on each governed invocation** — with
  **no synchronous catalog approval call and no per-invocation
  subject-resolution call**.
- Evaluate a **signed policy bundle that syncs in the background** (periodic
  refresh), not a policy fetched per call.
- Resolve **identity and grants through a separate session flow outside the
  daemon** (identity claim/enrollment and the access-request/grant workflow),
  not a per-call round trip.
- Treat a **deny as final for that invocation**. A later durable grant —
  requested separately after repeated denials — affects only **later** calls.
  The runtime never pauses or retries the call.
- Leave **workflow preflight and prompts to the harness**; the runtime does not
  own that UX.

**Pending G0 — do not treat as implemented:** bundle trust (signature
verification), the identity-proof/grant representation (how an approved grant
becomes trusted local subject attributes, and how pending, denied, revoked,
unlinked, and cross-workspace identities resolve), and freshness/revocation
bounds.

**Present-day truth:** the CLI `authorize` path remains the current production
path until local-PDP runtime support ships. HAI-272 (Backlog) tracks the socket
tool-authorize migration; the socket authorize route is **not available**. Do
not describe the local PDP, bundle verification, or bundle refresh as
implemented.

## Validation commands

```sh
kei-proxy help
kei-proxy runtime bootstrap | jq '{installation_id, status, binding_status, workspace_id}'   # workspace_id must be present
kei-proxy authorize --user U --tool T --action A --resource R; echo "exit=$?"               # expect a deny for an unbound tool
```

## Realistic usage boundaries

- A missing `workspace_id` in bootstrap output means the credential predates
  the workspace boundary. Stop and rotate it (`kei-credential-rotation`); never
  fall back to organization-wide scope.
- Provider credentials, payloads, results, documents, embeddings, and indexes
  stay in the runtime. Only decisions and redacted audit metadata go to Kei.
- Unsupported harnesses, missing bindings, invalid installation scope, stale
  policy, and no matching policy are all DENY.
- Creating installations, credentials, or agents is not a `kei-proxy`
  job. Installations and credentials are `kei` (`kei-cli`); agents
  are the console.
