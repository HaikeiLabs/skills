---
name: deploy-agents
description: Deploy and distribute a governed AI agent with Kei — create a runtime installation and deliver its credential (KEI_RUNTIME_TOKEN) to a secret manager, run kei-proxy as an in-container daemon beside the harness (runtime bootstrap, heartbeat, `kei-proxy serve` on an owner-only Unix socket, per-user sessions, local POST /v1/authorize), bind it, connect the harness (Claude Code, Codex, OpenCode via skills + `kei harness sync`; a Discord or other chat bot via its own installation and per-user sessions), control what the agent may do with policies (tool-call policies by group, harness command policies with `kei policies`), and add connectors whose OAuth is per user (`kei connectors create --account-model per_user`, connect links). Use when someone asks how to ship, deploy, containerize, host, distribute, or roll out an agent built with agentware/kei-agents, how to give it permissions, or how users connect their own accounts. Building the agent is build-agents-agentware; testing it is test-agents.
---

# Deploy and distribute governed agents

Deploying an agent with Kei means putting a **runtime** beside it. The runtime
(`kei-proxy`) holds the installation credential, syncs the workspace policy,
makes the allow/deny decision locally, runs governed connector calls with the
user's own credential, and ships redacted audit metadata. Provider payloads,
results, and credentials stay in your environment; Kei keeps metadata only.

```
 your container ───────────────────────────────────────────────┐
 │  harness (your agent + agentware)                           │
 │      │  KeiProxyEvaluator → kei-proxy authorize  (subprocess)│
 │      │  or POST /v1/authorize over the Unix socket           │
 │      ▼                                                       │
 │  kei-proxy serve  (same UID, socket mode 0600)               │──► Kei control plane
 │      policy bundle · sessions · per-user connector creds     │    (policy, metadata, audit)
 └──────────────────────────────────────────────────────────────┘
```

Two CLIs, two jobs: **`kei`** is the admin CLI a person runs (needs
`kei login`, owner/admin, browser-approved); **`kei-proxy`** is what the
runtime runs (authenticates with `KEI_RUNTIME_TOKEN`, never `kei login`).

## 1. Create the runtime installation

One installation per runtime boundary (one harness deployment : one
installation : one credential).

```sh
kei login                                         # a person approves in the browser
kei bot init --platform cli --name "acme-agent"   # cli | teams | discord | slack | ... — check `kei help`
kei workspaces list
kei bot credential --installation INSTALLATION_ID --workspace WS | <secret-manager import>   # shown only once
```

**The credential is shown only once**, so tell whoever runs this before they
run it: there is no second look. Pipe it straight into the secret manager; the
CLI refuses to print it to a terminal. If it already exists the command fails —
replacing it is a rotation that breaks the running runtime immediately (load
`kei-credential-rotation`).

## 2. Run kei-proxy in the container

There is no public `kei-proxy` image: put the `kei-proxy` binary in your
harness image (it ships with the `kei` installer; container builds use the
Kei runtime Dockerfile). Inject three variables into the harness process:

```text
KEI_RUNTIME_CONTROL_PLANE_URL=https://app.haikeilabs.com   # the gateway; never append /api/v1
KEI_RUNTIME_TOKEN=<from the secret manager>                 # env only, never argv, never a file in the repo
KEI_RUNTIME_VERSION=<your deployed version>
```

Never pass an org, tenant, or workspace ID as scope; the token determines it.
Entrypoint, in order:

```sh
kei-proxy runtime bootstrap                    # verify the installation; prints installation_id, org_id, workspace_id
kei-proxy runtime heartbeat --interval 1m &    # liveness, under the same supervisor as the harness
kei-proxy serve &                              # optional daemon: owner-only Unix socket
exec my-harness
```

If bootstrap output has no `workspace_id`, stop and re-mint the credential.

**The daemon (`kei-proxy serve`).** It listens on a Unix socket —
`/run/kei-proxy/runtime.sock` on Linux (`KEI_RUNTIME_SOCKET_PATH` overrides),
mode `0600`, so the harness must run as the same UID; on Kubernetes share the
directory through an `emptyDir`. It serves `GET /healthz`, `GET /readyz`,
model routes, and the governed routes:

- `PUT /v1/session` with `{"schema":"kei.session/v2","source":"discord","external_id":"<user id>"}`
  → `201 {"session_id":"ks_…","user_id":…,"status":"linked",…}`. One daemon
  serves **many concurrent sessions**, one per user or agent, each with its
  own subject and its own connector credentials. Session and model routes
  require the runtime bearer token.
- `POST /v1/authorize` with header `X-Kei-Session: <session_id>` — decided
  **locally** by the runtime PDP against the synced policy bundle, no per-call
  round trip. It is the only socket route that needs no bearer token (the
  `0600` socket is the boundary).
- `DELETE /v1/session` ends the session and flushes its credentials; idle
  sessions end after `KEI_SESSION_IDLE_TTL` (default `30m`). An unknown or
  expired id denies `session_not_found`.

The agentware `KeiProxyEvaluator` spawns `kei-proxy authorize` per call. That
CLI takes `--session` (default `$KEI_SESSION_ID`); the evaluator passes only
allowlisted `KEI_*` variables to the child, so supply the session id (and a
non-default socket path) through `extra_env`. Without the daemon, the CLI
path still works and still fails closed.

## 3. Bind and attach the agent

```sh
kei bot bind --installation INSTALLATION_ID          # explicit: a runtime cannot activate itself
kei bot agents add --installation INSTALLATION_ID --agent AGENT_ID --default
kei bot status --installation INSTALLATION_ID
```

Agents are created in the web console (**Agents**); there is no CLI command
for it. The harness discovers its agent from the runtime identity
(`link.identity()`), never from an env var.

## 4. Connect the harness

**Coding harnesses (Claude Code, Codex, OpenCode, Pi).** Install the Haikei
skills (Claude Code: `/plugin marketplace add HaikeiLabs/skills` then
`/plugin install haikei@haikei`; Codex: `codex plugin marketplace add
HaikeiLabs/skills` then `codex plugin add haikei@haikei`; OpenCode and Pi:
clone the repo and link each skill folder into `~/.config/opencode/skills/` or
`~/.agents/skills/`). On a workstation the runtime is set
up with `kei setup` (token piped on stdin) and `kei runtime bootstrap`. These
desktop harnesses are **auto-discovered**; render Kei policy into their native
config with:

```sh
kei harness sync --harness claude_code      # or codex, opencode — back up the native config first
```

`kei harness add --kind custom` is only for a custom/SDK harness you built.

**Chat harnesses (a Discord bot, Teams, Slack).** Create the installation with
that platform (`kei bot init --platform discord …`) and open one daemon
session per chat user (`"source":"discord","external_id":<the user's id>`).
The invoking subject is that human, carried unchanged into every subagent
call. A user whose chat identity is not linked gets a deny with an
`enrollment` claim link: send it to **that user privately** (a DM), never to
the channel, never to logs; each response mints a new link, so always show the
newest.

Then prove it fails closed: one permitted, disposable call and one call no
policy allows must be denied without reaching the provider.

## 5. Permissions are policies

What the agent may do is decided by workspace policy at run time, never by the
prompt and never by a local allow list in the harness (stale on deploy and
invisible to audit). Two kinds:

| Policy | Governs | Managed with |
| --- | --- | --- |
| **Tool-call (ABAC)** | Which subject/group may call which tool or connector capability | Console **Policies**, or `/api/v1/policies` (`kei-api`); group membership with `kei groups members add GROUP USER --workspace WS` |
| **Harness command** | What a coding harness may run (`shell:`, `skill:`, `path:` destinations) | `kei policies create|import|update`, rendered by `kei harness sync` |

```sh
kei policies create --workspace WS --name "allow git" --src-pattern "harness:opencode" \
  --dst-pattern "shell:git" --effect permit --priority 100
kei policies import --from claude --workspace WS            # dry run; --apply creates them
```

At equal priority a deny beats a permit. A typical agent split: everyday tools
(`file_bug`, `search_wiki`, `web_search`) for the `default` group, every tool
that reads or writes governed data for admins. The governed tool must also be
registered in the catalog (its `KeiScope` manifest) before Kei can decide it.

## 6. Connectors with per-user OAuth

Each user should act with **their own** account, so the audit trail and the
provider both see the real person.

```sh
kei connectors create --workspace WS --provider linear --name linear            # OAuth; per_user is the default
kei connectors create --workspace WS --provider google_drive --name drive --account-model shared
kei connectors reconnect CONNECTOR_ID --workspace WS                            # shared account only
kei connectors list --workspace WS
```

Providers: `gmail`, `google_drive`, `linear`, `github` (OAuth), `tito`, `crm`
(shared secret, read from stdin, never a flag). For a **per-user** connector
there is nothing for the admin to connect — `kei` prints "users connect their
own accounts through their chat harness". The first time a user's call needs
it, authorize denies with a `connect` block (`url`, `provider`,
`connector_id`, `expires_at`); the harness sends that one-time URL privately
to that user, and the next call succeeds. In identity mode
(`KEI_CREDENTIAL_RELEASE=identity`) the daemon fetches the user's connector
credential when their session starts and holds it **in memory for that session
only**; `POST /v1/connectors:invoke` runs the provider call inside the daemon,
and no socket route ever returns a credential.

## Validation commands

```sh
kei help                                             # confirm every command above exists in your version
kei bot status --installation INSTALLATION_ID        # bound, heartbeating
kei-proxy runtime bootstrap                          # JSON includes workspace_id
curl --unix-socket /run/kei-proxy/runtime.sock http://localhost/readyz
kei harness sync --harness claude_code --dry-run
kei connectors list --workspace WS
```

## Realistic usage boundaries

- Never put `KEI_RUNTIME_TOKEN` in argv, a repo file, a log, or the audit
  trail. Never log or share an enrollment or connect URL.
- No public `kei-proxy` image or registry exists; do not invent one.
- There is no CLI command to create agents or organizations, or to write
  tool-call (ABAC) policies — use the console or the Kei API.
- Rotating the runtime credential breaks the running runtime at once; plan the
  restart (`kei-credential-rotation`).
- Only github, gmail, google_drive, and linear run with session-held OAuth in
  the daemon; other connectors use a shared secret in your secret manager.
- Kei decides; it never executes provider calls or stores provider data.

## Related skills

- `kei-runtime-setup` — the full installation walkthrough and recovery.
- `kei-proxy` — runtime command reference. `kei-cli` — admin command reference.
- `kei-harness-setup` — per-harness install scripts and troubleshooting.
- `kei-harness-policy` — harness command policies in depth.
- `build-agents-agentware`, `test-agents` — build and test before you ship.
