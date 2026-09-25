---
name: kei-proxy
description: The `kei-proxy` runtime executable for governed agent operations: authorize tool calls, invoke governed connectors, bootstrap and report runtime health, and ship audit records. Load when configuring a harness or asking how Kei allows or denies a runtime operation. For platform administration, use the `kei` CLI skill.
---

# kei-proxy (runtime for agent interaction)

Kei has two executables. Mixing them up is the most common mistake, so
settle which one a task needs before anything else:

| | `kei` — platform admin CLI | `kei-proxy` — runtime |
| --- | --- | --- |
| Who runs it | A person: org `owner`/`admin`, on a workstation | The harness, as a subprocess, per governed operation |
| Authenticates with | `kei login` device flow → CLI token in the OS keychain | `KEI_RUNTIME_TOKEN` (runtime credential or `kh_live_` agent key) from the environment |
| Talks to | The control plane's admin APIs | The control plane's runtime APIs, plus local secret stores and providers |
| Jobs | Log in, create/inspect/bind/delete runtime installations, emit/rotate runtime credentials | Decide allow/deny for a tool call, run allowed connector work locally, bootstrap + heartbeat, ship audit |
| Lives | Operator's laptop | Same container/host as the harness |
| Skill | `kei-cli` | this one |

An agent never runs `kei login` or `kei bot …` to do its work, and a person
never needs `kei-proxy authorize` to administer the platform. `kei setup` and
`kei runtime bootstrap` are the one bridge: admin-CLI conveniences that write
local runtime config and shell out to `kei-proxy` to check it.

Your knowledge of `kei-proxy` subcommands may be outdated. **Prefer retrieval.**

## Retrieval sources

| Source | How to retrieve | Use for |
| --- | --- | --- |
| Installed binary | `kei-proxy help`, `kei-proxy <command> --help` | Commands, flags, env vars for this version |
| Console: Configure the tenant-side proxy | `https://app.haikeilabs.com/#/docs/add-a-workspace` | Runtime env, bootstrap output, container build |
| Console: Test Agent Keys | `https://app.haikeilabs.com/#/docs/test-agent-keys` | `authorize` with a `kh_live_` key |
| Console: Audit logs | `https://app.haikeilabs.com/#/docs/groups-policies-users` | `collector` |

## FIRST: confirm it is present and configured

```sh
kei-proxy --version
kei-proxy help
```

It must be on the same host or in the same image as the harness. On a
workstation it is installed alongside `kei` by the release installer. For a
container, use the current public release and packaging instructions.

On a workstation you normally don't bootstrap with `kei-proxy` directly:
`kei setup` stores the settings and `kei runtime bootstrap` runs
`kei-proxy runtime bootstrap` for you. Call `kei-proxy` directly in deployed
runtimes, and always for the per-call commands below.
The harness process needs, in its environment:

```text
KEI_RUNTIME_CONTROL_PLANE_URL=https://YOUR_KEI_GATEWAY   # no /api/v1 suffix
KEI_RUNTIME_TOKEN=<from the secret manager>              # never an argument
KEI_RUNTIME_VERSION=<runtime version>
```

The token determines installation, organization, and workspace scope. Do not
pass org, tenant, or workspace IDs as scope. `--key` exists on some commands
but puts the token in the process list and shell history; use the env var.

## Quick reference

| Task | Command |
| --- | --- |
| Decide a tool call (and fetch its credential on allow) | `kei-proxy authorize --user U --tool T --action A --resource R` |
| Invoke a governed data connector | `kei-proxy connector invoke --connector ID --capability C --action A --resource R [--approval-id ID]` |
| Verify installation + first heartbeat | `kei-proxy runtime bootstrap` |
| Keep liveness current | `kei-proxy runtime heartbeat --interval 1m` |
| Ship local audit JSONL | `kei-proxy collector [--poll --poll-interval 1m]` |
| Sync credential-store metadata | `kei-proxy credential sync` |
| Model profile / invocation | `kei-proxy model profile …`, `kei-proxy model --harness-key …` (request JSON on stdin) |

## authorize: the per-call decision

The adapter calls this before every governed tool runs and obeys the result:

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

Identity and delegation come from flags or environment:

| Env | Flag | Meaning |
| --- | --- | --- |
| `KEI_PROXY_INVOKING_SUBJECT` | `--invoking-subject` | The human who started the task (defaults to `--user`); keep it through subagent hops |
| `KEI_PROXY_AGENT_ID` / `KEI_PROXY_AGENT_VERSION` | `--agent-id` / `--agent-version` | The agent making the call |
| `KEI_PROXY_FRAMEWORK` | `--framework` | Harness, e.g. `claude`, `codex` |
| `KEI_PROXY_SPAN_ID` / `KEI_PROXY_PARENT_SPAN` / `KEI_PROXY_DELEGATION_DEPTH` | `--span-id` / `--parent-span` / `--delegation-depth` | Delegation chain; span ID is the dedupe key |
| `KEI_PROXY_TOOL_ARGS_DIGEST` | `--tool-args-digest` | SHA-256 of the tool args — never the raw args |
| `KEI_PROXY_REGISTRY` | `--registry` | Tool → service registry (default `/data/config/tools.yaml`) |

Never put a tenant, org, or workspace ID into agent-controlled tool
parameters, and never log the credential `authorize` returns.

## connector invoke

For governed data connectors. Mutating capabilities need an approval
reference (`--approval-id`) from an approved request in the console's
**Approvals**; an approval is bound to org, workspace, agent, connector,
capability, and resource and cannot be reused elsewhere. Pass
`--idempotency-key` for retried writes.

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
- Creating installations, credentials, agents, or keys is not a `kei-proxy`
  job. Installations and credentials are `kei` (`kei-cli`); agents and agent
  keys are the console.
