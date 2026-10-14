---
name: kei-proxy
description: "The `kei-proxy` runtime executable (kei-connector-runtime) — what an agent harness calls at run time to get a governed decision: `kei-proxy authorize` before a tool call (one-shot CLI), `kei-proxy serve` to run as a long-lived daemon exposing HTTP over a Unix socket (readiness, model routes; governed authorize route tracked by HAI-272), `connector invoke` for governed data, `runtime bootstrap|heartbeat`, `collector` for audit shipping, `hook` for report-only harness audit events, `model`, and `credential sync`. Load whenever code or config in a harness, adapter, container, or agent calls kei-proxy, sets KEI_RUNTIME_* or KEI_PROXY_* variables, reads its exit codes or JSON, or someone asks how an agent's tool call gets allowed or denied by Kei. Not for platform administration (logins, installations, credentials) — that is the `kei` CLI (kei-cli skill)."
---

# kei-proxy (runtime for agent interaction)

A tool adapter asks `kei-proxy authorize` before every tool call. Exit 0 means
allow; treat any non-zero exit as deny. The runtime credential comes from the
environment (`KEI_RUNTIME_TOKEN`, never an argument), and the agent ID is
auto-discovered from the runtime installation: never set an agent-ID variable
or pass `--agent-id`.

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

`kei login` belongs to the `kei` platform admin CLI, never to the `kei-proxy`
runtime, so an agent never runs `kei login` or `kei bot …` to do its work, and a person
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
If you cannot run the binary or open the sources below (no shell or network),
answer from this skill and don't retry. Its tables match kei-proxy 0.1.11 and
later. For example, `authorize` takes `--user`, `--tool`, `--action` and
`--resource`, and never `--agent-id`, because the agent ID is auto-discovered.

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

Leave `ABAC_URL` unset in runtime mode. Since kei-proxy 0.1.32, `authorize`
resolves subjects at `KEI_RUNTIME_CONTROL_PLANE_URL` when `ABAC_URL` is unset;
an explicit `ABAC_URL` still wins. Production accepts only HTTPS here, so an
in-cluster plain-HTTP catalog URL in `ABAC_URL` (or one a harness copies into
the child environment) denies every subject-scoped call with
`subject_resolution_unavailable` (`request_build`).

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
| Sync credential-store metadata; deliver connector secrets to this runtime | `kei-proxy credential sync` (claims one pending delivery per run) |
| Run a connector call inside the daemon (identity mode) | `POST /v1/connectors:invoke` on the socket, or `kei-proxy connector invoke` as its client (`KEI_CREDENTIAL_RELEASE=identity`) |
| Record a harness tool event for audit (report-only; installed by `kei harness sync`, not run by hand) | `kei-proxy hook claude` (event JSON on stdin from Claude Code) |
| Model profile / invocation | `kei-proxy model profile …`, `kei-proxy model  # uses runtime identity (no key flag needed)` (request JSON on stdin) |
| Show bundle state | `kei-proxy policy show` (reads persisted state; never contacts control plane) |
| Force bundle refresh | `kei-proxy policy sync` (bypasses normal poll schedule) |
| Long-running daemon (Unix socket + optional TCP) | `kei-proxy serve` (`KEI_RUNTIME_SOCKET_PATH`, default `/run/kei-proxy/runtime.sock`; TCP on `KEI_PROXY_LISTEN_ADDR`, default `:8085`, for existing Docker same-container deployments). Current socket routes: `GET /healthz`, `GET /readyz`, `GET /v1/models`, `POST /v1/chat/completions`. Governed tool authorize route tracked by HAI-272. See `docs/unix-socket.md`. |

`kei-proxy org` and `kei-proxy init` also exist. They call the Kei API
directly with a service secret and are Haikei-internal provisioning tools, not
part of a customer harness. Don't wire them into an agent.

For the full lifecycle of bundle identity, polling, state machine, and
troubleshooting, see [`bundle-versioning.md`](../kei-harness-policy/references/bundle-versioning.md)
in the kei-harness-policy skill.

## authorize: the per-call decision

> **If your harness uses the agentware SDK**, prefer `KeiProxyEvaluator`
> (see `agentware-sdk` skill) over calling `kei-proxy authorize` directly.
> The evaluator handles spawn, timeout, env filtering, decision parsing,
> enrollment extraction, and all fail-closed invariants. This reference is
> for direct calls when you cannot use the SDK.
>
**When describing `kei-proxy authorize`, always state that credentials
come from the `KEI_RUNTIME_TOKEN` environment variable, never from a
command-line argument.** The token is the sole runtime credential.
Agent identity is **auto-discovered** from the runtime installation
credential — do not tell the caller to set `--agent-id`.

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
  here. `reason_code: policy_bundle_expired` (`deny_source: runtime_state`)
  means the persisted bundle's `not_after` has passed; until [HAI-427](https://linear.app/haikeilabs/issue/HAI-427) ships, any
  policy edit forces a new bundle (see `kei-setup-doctor` §4a).
- **stderr** gets a structured audit event; with `KEI_PROXY_AUDIT` set, the
  decision is also appended to that JSONL file for `collector`.

### Disabling kei-proxy denies every governed tool call

`KEI_PROXY_DISABLED=true` is a valid setting, but it turns permits off: a
disabled, missing, or misconfigured kei-proxy is a **deny on every governed
call** (fail-closed, HAI-249). It never permits a tool call. Tests that need an
allow inject a fake evaluator instead of relying on a disabled proxy (see the
`agentware-sdk` skill for the evaluator and its test fixtures). A production
harness should not run with kei-proxy disabled — every governed tool would be
denied. Non-governed calls are unaffected: they are local, never reach Kei,
and need no bypass. Only governed calls need the fake evaluator in tests.

This applies only to **governed** calls. **Non-governed** local calls never
reach Kei, with or without kei-proxy: they run in the harness with no policy
check and no audit event, so disabling kei-proxy neither blocks nor permits
them (see [Governed vs non-governed tool calls](#governed-vs-non-governed-tool-calls)).

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

## Identity mode: connectors run inside the daemon

Short answer for an `opaque_ref` connector (for example the `http_api`
connector named `crm`): it is not live in proxy-v0.2.4. It needs kei-proxy
0.2.5 or newer and the catalog's `POLICY_BUNDLE_V2_CONNECTORS` gate enabled
in the control plane (off by default). Once live, such a
call can deny with `credential_unavailable`, `credential_backend_mismatch` or
`descriptor_invalid`, among the codes below.

With `KEI_CREDENTIAL_RELEASE=identity` (default `legacy`), `kei-proxy serve`
runs each governed connector call itself through `POST /v1/connectors:invoke`
on the owner-only socket, and `kei-proxy connector invoke` is a thin client of
that route. The daemon returns only the result. No socket route ever returns a
credential.

Which connectors run depends on the policy bundle:

- **Today (proxy-v0.2.4, and any bundle without connector descriptors).**
  Only connectors whose credential is the user's own OAuth connection
  (`oauth` / `per_user`: github, gmail, google_drive, linear) run. Connectors
  that need config or an `opaque_ref` secret deny
  `credential_source_not_supported`.
- **With connector descriptors (HAI-378, ADR-034 amendment).** The v2 bundle
  carries a non-secret descriptor per active connector in
  `policy_set.connectors`, and each descriptor decides. Identity mode then
  runs `opaque_ref` connectors, including `http_api` connectors such as the
  one named `crm`. The daemon looks up the descriptor's
  `kei://connectors/<id>/<field>` reference in the connector reference index
  that `kei-proxy credential sync` wrote, checks that the index's backend
  equals the descriptor's `credential_backend`, and reads the secret from the
  tenant secret store (AWS Secrets Manager or Azure Key Vault) with the
  runtime's own cloud identity. The value goes only on the provider request
  (for `http_api`, the `credential_injection` header). `kei://connectors`
  references on `POST /v1/commands:run` resolve the same way.

**Release status: not live yet.** Descriptor support (kei-connector-runtime
719866b) ships in kei-proxy 0.2.5 or newer; proxy-v0.2.4 and older don't
have it. The control plane emits descriptors only once the catalog's
`POLICY_BUNDLE_V2_CONNECTORS` gate is enabled, and it is off by default. Until
both are in place, identity mode behaves as described under "Today".

Deny codes for a connector call in identity mode (all fail closed, no retry,
no fallback to the catalog):

| `reason_code` | Meaning |
| --- | --- |
| `credential_source_not_supported` | The bundle has no descriptors and the connector is not a session OAuth provider, or the descriptor is `oauth` with a shared account |
| `descriptor_invalid` | The routed connector has no descriptor, or its descriptor fails the contract (including a capability this runtime's contracts version does not know) |
| `account_model_not_supported` | `account_model: domain_delegation`, not executed yet |
| `credential_unavailable` | The secret was never delivered to this runtime, `credential sync` has not run, or the secret store read failed or timed out |
| `credential_backend_mismatch` | The index entry's backend differs from the descriptor's `credential_backend`, or the reference names another connector or field |
| `provider_error` | The provider response contained the credential, so the result is withheld |

A harness treats every one of these as a deny for that call. To diagnose
them, use `kei-setup-doctor`. To deliver the secrets first, see
`kei-runtime-setup`.

## hook: report-only audit of desktop harness calls

**Minimum versions: Claude Code 2.1.119 or newer and kei-proxy 0.2.5 or
newer.** What the Claude Code hook records depends on both. Below either
minimum there are no `decision` and no `permission_reply` events: every call
is recorded only as `pre` (`native_decision: unknown`) and, if it ran, `post`.
The event sequences below hold only at these versions or newer.

Desktop harnesses (Claude Code, Codex, OpenCode) decide shell commands
natively from the config `kei harness sync` renders. Sync also installs
`kei-proxy hook <harness>` as a hook in the harness. The hook only reports:
it always exits 0, never blocks, and never allows or denies. Do not wire it
into an agent yourself, and never make it answer a permission prompt.

For Claude Code the native decision is **observed, not computed**:
`PreToolUse` runs before Claude Code's permission check, so the hook records
what Claude Code then did instead of re-evaluating its rules.

| Event phase | `native_decision` |
| --- | --- |
| `pre` | `unknown` (the pairing anchor, not the decision) |
| `decision` (one per call) | `allow` (ran without asking), `deny` (neither asked nor ran), or `ask` (Claude Code asked) |
| `post` | `executed`, with an optional `failed: true` when the command failed (the error text is never recorded) |
| `permission_reply` (asked calls only) | `approved` if it then ran, `denied` if the session ended without running it |

Audit readers take the decision from the `decision` event, not from `pre`.
Every call starts with `pre` (`unknown`); what follows depends on the outcome:

| Outcome | Events after `pre` |
| --- | --- |
| Allowed, ran and succeeded | `decision: allow`, then `post: executed` |
| Allowed, ran and failed | `decision: allow`, then `post: executed` with `failed: true` |
| Denied (neither asked nor ran) | `decision: deny`, written when the session stops |
| Asked, then approved and ran | `decision: ask`, `permission_reply: approved`, then `post: executed` |
| Asked, never ran (rejected, or auto-rejected in a headless run) | `decision: ask`, then `permission_reply: denied` when the session ends |

On Claude Code 2.1.119 or newer, sync renders seven hook events
(`PreToolUse`, `PermissionRequest`, `PermissionDenied`, `PostToolUse`,
`PostToolUseFailure`, `Stop`, `SessionEnd`), but an older kei-proxy still
writes no `decision` events for them. On an older or undetectable
Claude Code sync keeps the previous two (`PreToolUse`, `PostToolUse`) and
prints a warning; those calls are recorded with `native_decision: unknown`
and no `decision` event. Upgrade Claude Code and re-run `kei harness sync`.
Rendering is covered in the `kei-harness-policy` skill.

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
path until local-PDP runtime support ships. It evaluates the locally persisted
policy bundle and still bootstraps (whoami and heartbeat) on every call.
Identity is only for credentials: since kei-proxy 0.1.34, it resolves the
caller's subject online
(`subject-attributes:resolve`) only when the tool releases a credential, is
bound to a connector capability, or a policy reached for the call matches on
subject attributes (`group:`, `org:`, `user:`, `email:`). A tool such as
`web_search` under a `*` or `agent:` policy is decided with no subject lookup.
kei-proxy 0.1.33 and earlier resolve the subject for every call that names a
user. HAI-272 (Backlog) tracks the socket
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
- Identity-mode `opaque_ref` and `http_api` connectors are not live in
  proxy-v0.2.4 or older, or while `POLICY_BUNDLE_V2_CONNECTORS` is off. Do not tell a
  user they run until both the release and the flag are in place.
- Creating installations, credentials, or agents is not a `kei-proxy`
  job. Installations and credentials are `kei` (`kei-cli`); agents
  are the console.

## Response requirements

- Whenever an answer covers calling `kei-proxy` (an adapter, a harness, a
  container, or `authorize`), YOU MUST say that the runtime token comes from
  the **`KEI_RUNTIME_TOKEN`** environment variable, never a command-line
  argument, and that the agent ID is **auto-discovered** (it resolves
  automatically from the runtime installation), so nobody sets an agent-ID
  variable or passes `--agent-id`.
- Whenever an answer contrasts `kei` with `kei-proxy`, or says an agent should
  not run `kei login`, YOU MUST call `kei` **"the platform admin CLI
  (kei-cli)"** and `kei-proxy` **"the runtime used by agents"**, using those
  exact phrases.
- Whenever an answer covers identity-mode connectors, connector
  descriptors, or the deny codes for `opaque_ref`/`http_api` connectors, YOU
  MUST say it is not live yet: it needs the catalog's
  **`POLICY_BUNDLE_V2_CONNECTORS`** gate enabled (off by default) and
  kei-proxy **0.2.5 or newer** (it is not in proxy-v0.2.4). Name the deny
  codes **`credential_unavailable`**, **`credential_backend_mismatch`** and
  **`descriptor_invalid`** explicitly.
