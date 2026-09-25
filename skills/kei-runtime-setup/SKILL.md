---
name: kei-runtime-setup
description: Stand up a customer-hosted Kei runtime end to end — create the runtime installation, deliver its credential (shown once) to a secret manager, configure `kei-proxy` beside the harness, bootstrap, keep heartbeats running, and bind. Use whenever someone is installing, configuring, containerizing, bootstrapping, or first-activating a Kei runtime, kei-proxy, or kei-connector-runtime, or asks what KEI_RUNTIME_* variables to set, even if they only say "get the bot talking to Kei" or "set up the proxy". For diagnosing an installation that already exists and is misbehaving, use kei-setup-doctor instead.
---

# Set up a Kei runtime

A Kei runtime is the tenant-side half of Kei. The control plane keeps policy,
connector metadata, and redacted audit metadata; the runtime makes the live
allow/deny decision and executes allowed work locally, so provider payloads,
results, and credentials never enter Kei. This skill takes a runtime from
"nothing" to "bound and heartbeating".

## Concepts

- **Harness** — software that lets an LLM act as an agent (for example Claude
  Code, OpenCode, or a custom bot).
- **Kei-enabled harness** — a harness governed by Kei through a **runtime
  installation**.
- **Runtime installation** — Kei's record for the one runtime deployed beside
  that harness (one harness : one runtime installation : one credential,
  `KEI_RUNTIME_TOKEN`). The console page is called **Runtime installations**.
- **Agent** — an LLM configuration the harness runs (model, system prompt,
  tools).

This is a workflow skill that uses both Kei executables: `kei`, the platform
admin CLI a person runs (command reference: **`kei-cli`**), and `kei-proxy`,
the runtime the harness runs for agent interaction (command reference:
**`kei-proxy`**). This skill decides the order and the checks between them.

## Retrieval sources

| Source | How to retrieve | Use for |
| --- | --- | --- |
| Installed binaries | `kei help`, `kei-proxy help`, `kei-proxy runtime --help` | Exact subcommands, flags, env vars for the installed versions |
| Console: CLI authentication and identity | `https://app.haikeilabs.com/#/docs/create-an-organization` | Login, installations, `kei setup`, credentials |
| Console: Configure the tenant-side proxy | `https://app.haikeilabs.com/#/docs/add-a-workspace` | Runtime env vars, bootstrap output, container build |
| Console: Agent setup | `https://app.haikeilabs.com/#/docs/agent-setup` | Harness → runtime → policy catalog flow, DENY rules |

When this skill and the binaries' help disagree, trust the binary and tell the
user.

## Two binaries, two jobs

| Binary | Role | Who runs it | Auth | What it does |
| --- | --- | --- | --- | --- |
| `kei` | Platform admin | An org owner/admin, on their workstation | `kei login` (browser device flow) | Logs in, creates installation metadata, emits the runtime credential, writes local runtime config, binds |
| `kei-proxy` | Runtime for agent interaction | The harness, as a subprocess, inside the runtime | `KEI_RUNTIME_TOKEN` env | Bootstraps the installation, sends heartbeats, authorizes each governed tool call |

Steps 0–3 and 7 below are admin work with `kei`. Steps 4–6 configure and
bootstrap the runtime: on a workstation with `kei setup` + `kei runtime
bootstrap` (which drive the bundled `kei-proxy` for you), in a deployed runtime
with `kei-proxy` directly. Step 7 is the runtime answering real calls. The
runtime never needs `kei login`.

Governed tool calls have **no network listener**: `kei-proxy` runs in the same
container or on the same host as the harness, which invokes it per operation
and reads the decision from its output. Do not design a sidecar service or
expose a port for governed calls. (`kei-proxy serve` is a separate, opt-in
local OpenAI-compatible model endpoint; see the `kei-proxy` skill.)

## Before you start

- The org and workspace already exist. They are created in the Kei web app;
  there are no `kei org` commands (use `kei workspaces list` to discover
  workspace names and IDs from the CLI).
- The operator is an org `owner` or `admin`. Anyone else is refused at login
  with `403 organization administrator role is required`.
- The `kei` CLI is installed (see the `kei-cli` skill) and `kei --version`
  works.
- The customer has a secret manager the runtime can read from. The runtime
  credential goes there and nowhere else.

## 0. Log in first

Every `kei bot …` command (`init`, `credential`, `agents`, `status`, `bind`,
`delete`) calls the control plane with the operator's CLI token, so run
`kei login` before any of them:

```sh
kei login                                       # add --no-browser when headless
```

It is a browser device flow: the CLI prints a URL and a verification code, an
org owner/admin approves it in a signed-in browser, and the token is stored in
the OS keychain — never printed, never in a config file. Things that trip
people up:

- The token is bound to the organization chosen at approval and to the API URL
  host. Logging in to one environment does not log you in to another; log in
  again per environment.
- The token is short-lived. A `not logged in; run kei login first` error, or a
  401 partway through a long session, means log in again and retry.
- An agent cannot approve the device flow for the user. Run `kei login`, show
  the user the URL and code, and wait for them to approve before continuing.
- `kei setup`, `kei runtime bootstrap`, and everything `kei-proxy` does
  authenticate with the **runtime token**, not the login token — a runtime
  never needs `kei login`.

## 1. Create the installation

One installation per customer-owned runtime boundary. It is the identity used
for bootstrap, heartbeats, policy delivery, and audit context — separate from a
user login.

From the CLI (after `kei login`):

```sh
kei bot init --platform cli --name "Acme local runtime"
```

`--platform` takes exactly `cli`, `teams`, `discord`, or `slack`; confirm with
`kei help` because older releases and the console docs list only
`teams|discord|slack`. Use `cli` for a local coding harness runtime. Record the
returned `installation_id` — it is not secret.

From the web app instead: **Agents → Runtime installations → Create**. The
console creates the installation and reveals the credential in a single step
(atomic create+credential). Copy the credential immediately — it is shown once
only.

## 2. Discover the workspace

The credential must be scoped to a workspace. If you don't know the workspace
name or ID, list them from the CLI:

```sh
kei workspaces list
```

`--workspace` on `bot credential` accepts a workspace name or ID. Using the
name is fine — the CLI resolves it server-side.

## 3. Deliver the credential to the secret manager

The runtime credential is shown or emitted once. Send it straight into the
secret manager so it never lands in a terminal, a transcript, a file in the
repo, or a command-line argument:

```sh
kei bot credential --installation INSTALLATION_ID --workspace WS | <your secret-manager import command>
```

`--workspace` accepts the workspace name or ID. If omitted, the credential is
scoped to the installation's existing workspace (set at creation time). The CLI
refuses to write the credential to an interactive terminal; that refusal is the
guard working, not a bug to route around. If the installation already has a
credential the command fails with
`bot credential already exists; use --rotate to replace it` — that is a
rotation, and rotation breaks the running runtime immediately, so load
`kei-credential-rotation` before using `--rotate`.

### Recovery: installation stuck in "pending · unverified"

If the credential was never received (lost the reveal — it is shown only at creation) or the creation
step failed, the console shows **pending · unverified** with RUNTIME CREDENTIAL
**Not configured**. Recover by creating a credential for the existing
installation — do not recreate the installation under the same name (that
returns `409`). Either:

- **Console:** open the installation card's **Create credential** action.
- **CLI:** `kei bot credential --installation INSTALLATION_ID --workspace <name|id>`.

To recreate with a different name, delete the old installation first:
`kei bot delete --installation INSTALLATION_ID --yes`.

The web reveal shows `KEI_RUNTIME_CONTROL_PLANE_URL`, `KEI_RUNTIME_TOKEN`,
and the bootstrap command. `KEI_CREDENTIAL_STORE_INSTALLATION_ID` (the
**credential-store installation ID** (an installation used for secret-sync routing)
is **not** in the reveal — find it on the **Credential store** page or via
`kei credential-store get`. It is only needed for credential-store sync;
most deployments do not need it at all.

## 4–6. Configure and bootstrap — pick your path

There are two supported paths. They end in the same place (the installation
verified and heartbeating); they differ in where the runtime settings live.

| | **Workstation / local harness (current default)** | **Deployed runtime (container, server)** |
| --- | --- | --- |
| Get `kei-proxy` | Comes with `kei`: since kei-cli v0.1.4 the release installer also installs a pinned `kei-proxy` next to `kei` | Build `kei-proxy:local` from the Kei repo (below) or copy the bundled binary into the image |
| Settings live in | `~/.config/kei.yaml` (mode `0600`), written by `kei setup` | Harness process environment, from the secret manager |
| Bootstrap with | `kei runtime bootstrap` | `kei-proxy runtime bootstrap` |

### Path A: workstation — `kei setup` then `kei runtime bootstrap`

```sh
<secret-manager read> | kei setup --control-plane-url https://app.haikeilabs.com --harness-url http://127.0.0.1:8088
kei runtime bootstrap   # verifies the installation and sends the first heartbeat
```

- Feed the token to `kei setup` on stdin straight from the secret manager
  (for example `op read …`, `aws secretsmanager get-secret-value … --query
  SecretString --output text`), so no one copies or pastes it. When stdin is
  not a terminal, `kei setup` reads the token as the first line and uses
  defaults for anything else not given as a flag. Run interactively, it
  prompts with hidden input instead. Avoid `--runtime-token`: it lands in shell
  history and the process list.
- `kei setup` verifies the token against the control plane before saving.
  Use `--config PATH` for a separate environment.
- `kei runtime bootstrap` loads that config and runs the local `kei-proxy
  runtime bootstrap`, passing the URL and token in the child's environment —
  the same thing the harness will do. It finds `kei-proxy` via the configured
  path, then `PATH`; override with `--proxy-path`.
- Neither command needs `kei login`; they use the runtime token, not the admin
  login.

### Path B: deployed runtime — environment + `kei-proxy runtime bootstrap`

Set these on the harness process; `kei-proxy` inherits them as a child process:

```text
KEI_RUNTIME_CONTROL_PLANE_URL=https://YOUR_KEI_GATEWAY
KEI_RUNTIME_TOKEN=<loaded from the secret manager>
KEI_RUNTIME_VERSION=<your deployed runtime version>
```

- The control-plane URL is deployment-specific. Production and staging must be
  HTTPS. Do not append `/api/v1`; the runtime adds its own paths.
- Load `KEI_RUNTIME_TOKEN` from the secret manager or a protected env file,
  never from an argument.
- Do not supply an org, tenant, or workspace ID as scope. The token determines
  installation, organization, and workspace.

To build a container, use the private `HaikeiLabs/kei` repository, from its
root (the Dockerfile copies from both `cmd/kei-connector-runtime/` and
`contracts/connectors/`):

```sh
docker build -f cmd/kei-connector-runtime/Dockerfile -t kei-proxy:local .
```

The image contains only `kei-proxy`; add the harness to the same image. No
public `kei-proxy` image is published; do not invent a registry URL. Then, in
the runtime, before the harness accepts work:

```sh
kei-proxy runtime bootstrap
```

### Check the bootstrap output (both paths)

Bootstrap prints safe JSON: `installation_id`, `org_id`, `platform`, `status`,
`binding_status`, and `workspace_id`.

**If `workspace_id` is missing, stop.** The credential was minted before the
workspace boundary existed. Re-mint it (rotation) rather than using a
workspace-less credential.

### Keep the heartbeat running (both paths)

`kei runtime` only has `bootstrap`. Ongoing liveness is the runtime's job, run
under the same supervisor as the harness:

```sh
kei-proxy runtime heartbeat --interval 1m
```

## 7. Bind

Once the runtime has reported a heartbeat, activate it:

```sh
kei bot bind --installation INSTALLATION_ID
kei bot status --installation INSTALLATION_ID
```

Binding is deliberately explicit so a runtime cannot activate itself. Then
attach the agents this runtime serves:

```sh
kei bot agents add --installation INSTALLATION_ID --agent AGENT_ID --default
kei bot agents list --installation INSTALLATION_ID
```

Agents themselves are created in the web app; there is no CLI command to
create one.

## 8. Prove it fails closed

A runtime is not set up until a denial has been observed. Run one permitted,
disposable operation and one that no policy allows (for example an unbound
connector). The denied call must fail without a provider call and produce only
redacted audit metadata. Unsupported harnesses, missing bindings, invalid
installation scope, stale policy, and requests with no matching policy are all
explicit **DENY** — never a fallback to broader scope.

If the runtime writes local audit JSONL through `KEI_PROXY_AUDIT`, ship it:

```sh
kei-proxy collector                          # once
kei-proxy collector --poll --poll-interval 1m
```

## Validation commands

```sh
kei --version && kei help                    # confirms platform list and flags
kei-proxy help                               # confirms runtime subcommands and env vars
kei bot status --installation INSTALLATION_ID
kei runtime bootstrap | jq '{installation_id, status, binding_status, workspace_id}'        # workstation
kei-proxy runtime bootstrap | jq '{installation_id, status, binding_status, workspace_id}'  # deployed runtime
```

## Realistic usage boundaries

- The CLI does not provision cloud infrastructure. There is no `bot install`,
  `deploy`, `destroy`, or `list`; the customer owns hosting and secrets.
- `kei bot delete --installation ID --yes` removes the control-plane record and
  revokes the credential. It does not touch customer cloud resources.
- Never print, paste, commit, or pass the runtime token as an argument, and do
  not ask the user to paste it into the conversation.
- Registering the harness's skills and tool IDs against an installation has no
  CLI command or resource-oriented API yet; do that in the web app.
- Kei's own control plane runs on AWS EKS (production) and a Tailscale cluster
  (staging). The earlier GCP runtime was retired on 2026-08-31 and is not a
  deployment target.
