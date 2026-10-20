---
name: kei-cli
description: "The `kei` platform-administration CLI for Kei (run by an org owner/admin, not by agents) — install/upgrade (including `--proxy-only` and `--uninstall`), `kei login` device-flow auth, runtime installations (`kei bot list|init|credential|agents|status|bind|delete`), harness command policies (`kei policies`), data connectors (`kei connectors`, including remote MCP connectors created from a catalog template with `kei connectors create --template`, per-user OAuth connection with `kei connectors connect`, and tool manifests reviewed and approved with `kei connectors manifests`, alias `tools`), model profiles and the credential store (`kei model-profiles`, `kei credential-store` with `--workspace` overrides), harness management (`kei harness` — `add` for custom/SDK only, `sync` for all harnesses including auto-discovered desktop), one-command harness setup (`kei connect`), workspace and group management (`kei workspaces create`, `kei groups create|list`), local runtime config (`kei setup`, `kei runtime bootstrap`), and bug reports from a harness (`kei feedback`, which redacts the transcript and asks before sending). Load before running or suggesting any `kei` command so syntax, flags, and auth are right, and whenever someone asks how to do something from the CLI in Kei. Biases toward the installed binary's help and the Kei console docs over this file. There are no org or agent commands, and no group update/delete — say so rather than inventing one. (`kei workspaces list|create`, `kei groups create|list`, `kei connectors`, `kei policies`, `kei harness`, `kei model-profiles` and `kei credential-store` are the resource-oriented exceptions, v0.1.13 or later; `kei users` and `kei groups members` need v0.1.16 or later; `kei workspaces create` and `kei groups create|list` need v0.1.33 or later; `kei connectors connect` and `kei credential-store get|put --workspace` need v0.1.34 or later.) For how an agent's tool calls are allowed or denied at run time, use kei-proxy instead."
---

# kei CLI

`kei` is the Kei **platform administration** CLI. It authenticates an org
owner/admin and manages **runtime installations** — the identity a
customer-hosted runtime uses. It is not how agents interact with Kei at run
time; that is `kei-proxy`.

| | `kei` — platform admin (this skill) | `kei-proxy` — runtime for agent interaction |
| --- | --- | --- |
| Who runs it | A person: org `owner`/`admin` | The harness — as a one-shot CLI subprocess per governed operation, or as a `kei-proxy serve` daemon over a Unix socket |
| Auth | `kei login` → CLI token in the OS keychain | `KEI_RUNTIME_TOKEN` in the harness environment |
| Jobs | Login, installations, runtime credentials, bind, agents-on-installation | Allow/deny each tool call (`kei-proxy authorize`), governed connector calls (`kei-proxy connector invoke`), heartbeat, audit shipping |
| Skill | `kei-cli` | `kei-proxy` |

If the task is "make the agent's tool call go through Kei" or "check whether
the agent may do X", the answer is `kei-proxy authorize` — load `kei-proxy`,
not this skill. An agent never needs `kei login` to do its work. `kei setup`
and `kei runtime bootstrap` are the only bridge: admin conveniences that write
local runtime config and invoke `kei-proxy` to verify it.

Your knowledge of `kei` flags and subcommands may be outdated; the CLI is young
and changes between releases. **Prefer retrieval over this file.**

## Retrieval sources

| Source | How to retrieve | Use for |
| --- | --- | --- |
| Installed binary | `kei help`, `kei <command> --help`, `kei bot` (lists subcommands) | Exact commands, flags, and allowed values for the version actually installed |
| Kei docs | `https://docs.haikeilabs.com/kei/get-started/sign-in`, `https://docs.haikeilabs.com/kei/reference/cli` (CLI authentication and identity), `https://docs.haikeilabs.com/kei/runtime/tenant-runtime` (proxy runtime) | The customer-facing, supported workflow |
| `kei-cli` README | `https://github.com/HaikeiLabs/kei-cli` (private) | Install options, build from source |
| Release endpoint | `https://kei-cli-releases.s3.us-east-1.amazonaws.com/kei-cli/latest.txt` | Latest published version |

Append `.md` to any docs page URL for the raw page.

When this skill and `kei help` disagree, **trust `kei help`** and mention the
difference to the user.

## FIRST: check that `kei` is installed

```sh
kei --version     # prints "kei <version>"
```

If `kei --version` prints kubectl or AWS errors instead of a version, the name
is shadowed by an alias — oh-my-zsh's kubectl plugin defines
`alias kei='kubectl edit ingress'`. Diagnose with `type -a kei`; fix with
`unalias kei` after `source $ZSH/oh-my-zsh.sh` in `~/.zshrc`, or run
`command kei` or the full path (`~/.local/bin/kei`).

If it is missing, install with the checksum-verifying release installer
(macOS and Linux, arm64 and amd64). This is the recommended path:

```sh
export PATH="$HOME/.local/bin:$PATH"
curl -fsSL "https://haikeilabs.com/install.sh" \
  | sh -s -- -d "$HOME/.local/bin"
kei help && kei --version
```

If `haikeilabs.com` is unreachable, use the S3 fallback:
```sh
curl -fsSL "https://kei-cli-releases.s3.us-east-1.amazonaws.com/kei-cli/install.sh" \
  | sh -s -- -d "$HOME/.local/bin"
```

The installer is POSIX `sh` (it runs under `sh`, `bash`, and `dash` alike);
pipe to `sh`, not `bash`. Pin a release with `-v VERSION` (no leading `v`,
e.g. `-v 0.1.5`). Rerun the installer to upgrade. Since v0.1.4 the release
archive also carries a pinned `kei-proxy` (the runtime), and the installer puts
it next to `kei`, so a workstation gets both binaries from one install. The
bundled `kei-proxy` version is pinned in the `kei-cli` repo (the
`KEI_PROXY_VERSION` file) and verified against the release at build time, so the
proxy version is deterministic per release. `go install` builds only `kei`.

Two more installer modes exist (POSIX `sh`, same checksum verification):

```sh
# Install only kei-proxy (the runtime), pinned to KEI_PROXY_VERSION by default,
# with its own -v to pick a different version:
curl -fsSL "https://haikeilabs.com/install.sh" \
  | sh -s -- --proxy-only -d "$HOME/.local/bin"

# Remove exactly the files the installer recorded in .kei-install-manifest:
curl -fsSL "https://haikeilabs.com/install.sh" \
  | sh -s -- --uninstall -d "$HOME/.local/bin"
```

`--proxy-only` and `--uninstall` are mutually exclusive. The `--proxy-only`
default version resolves from the `KEI_PROXY_VERSION` env var, a
`KEI_PROXY_VERSION` file in the current directory, or the copy published
alongside `install.sh`.

`go install` also works (Go 1.26+), but the package path depends on the
release. Through v0.1.5 the command lives at the module root and builds a
binary named `kei-cli`, so rename it:

```sh
go install github.com/HaikeiLabs/kei-cli@latest
mv "$(go env GOPATH)/bin/kei-cli" "$(go env GOPATH)/bin/kei"
```

Releases after the entrypoint moved to `cmd/kei` build `kei` directly:
`go install github.com/HaikeiLabs/kei-cli/cmd/kei@latest`. If one path fails
with "does not contain package", use the other. `kei upgrade [--version V]`
reinstalls through `go install` (Go must be on `PATH`); it does not use the S3
installer.

## FIRST: log in

Every `kei bot …` command calls the control plane with the operator's CLI
token. Log in before any of them:

```sh
kei login                                                       # opens a browser
kei login --no-browser                                          # headless: prints URL + code
```

- It is an OAuth **device flow**. The CLI prints a URL and a verification code;
  a person approves it in a signed-in browser. As an agent, run the command,
  show the user the URL and code, and wait — you cannot approve it for them.
- Only an org `owner` or `admin` can complete approval. Others can start the
  flow but are refused with `403 organization administrator role is required`.
  Don't hand the CLI to a non-admin.
- The token is bound to the organization chosen at approval and to the API URL
  host (default `https://app.haikeilabs.com`, or `KEI_WEB_URL`). Login again
  if switching environments.
- The token goes to the OS keychain (service `kei-cli`, account = API host).
  It is never printed and never written to a config file.
- It is short-lived. `not logged in; run kei login first` or a 401 mid-session
  means log in again and retry.
- Diagnosing `not logged in` after an earlier login: give both causes. The
  token is short-lived, so a login from yesterday has likely expired; and it
  is per environment (per API host), so a staging login is not a production
  login. Either way, run `kei login` again against the host you mean.
- `kei logout` removes the local keychain entry only; it does not
  revoke the token server-side. Safe to repeat.

Commands that do **not** need `kei login`: `kei setup`, `kei runtime
bootstrap`, `kei upgrade`, `kei help`, `kei --version`. The first two
authenticate with the runtime token instead.

## Troubleshooting: `kei login`

### 1. Browser lands on the Dashboard and the CLI keeps waiting

**Symptom:** You run `kei login`, the browser opens to the Kei
Dashboard instead of the approval page, and the CLI hangs waiting for approval.

**Cause:** You were not already signed in at `app.haikeilabs.com`. The SSO
sign-in flow loses the OAuth return address — a known bug (HAI-370).

**Fix:** Sign in at `app.haikeilabs.com` first, then run `kei login` again
and approve on the "Kei CLI approved" page.

### 2. macOS dialog "Keychain Not Found … app.haikeilabs.com"

**Symptom:** During `kei login` a macOS dialog appears saying "Keychain Not
Found" or referencing `app.haikeilabs.com`.

**Cause:** The `HOME` environment variable is overridden (common in sandbox
or CI environments), so macOS cannot find `~/Library/Keychains`.

**Fix:** Run `kei` with your real `HOME`, or — for a sandbox `HOME` —
create a symlink so the sandbox points to your real keychain:

```sh
ln -s ~/Library/Keychains /path/to/sandbox/Library/Keychains
```

Click **Cancel** on the dialog. **Never click "Reset To Defaults"** — that
recreates the login keychain and can break other applications.

### 3. "organization owner or admin role is required" (403)

**Symptom:** The approval page shows `403 organization owner or admin role
is required`.

**Cause:** Only org owners and admins can approve the `kei login` device
flow. A user with the `member` role (or no org membership) is refused.

**Fix:** Ask an org owner or admin to run `kei login` and approve it. The
CLI token is bound to the approver's org, not to the caller's browser
session.

Answer with the cause and the fix together: only owners and admins can
approve, a `member` role gets this 403, so ask an org owner or admin to run
`kei login` and approve it.

## Troubleshooting

### 4. `kei runtime bootstrap` fails with "mkdir /var/lib/kei-proxy: permission denied" on macOS

**Symptom:** Running `kei runtime bootstrap` on macOS fails immediately with
a filesystem error about `/var/lib/kei-proxy`:
```
Error: mkdir /var/lib/kei-proxy: permission denied
```

**Cause:** `kei-proxy` defaults to a Linux-style state directory
(`/var/lib/kei-proxy`) that does not exist on macOS and requires root to
create. The hard-coded default is a known bug (HAI-374).

**Fix:** Set `KEI_RUNTIME_STATE_DIR` to a user-writable directory with
restrictive permissions before running bootstrap:

```sh
export KEI_RUNTIME_STATE_DIR="$HOME/.kei/state"
mkdir -p "$KEI_RUNTIME_STATE_DIR"
chmod 0700 "$KEI_RUNTIME_STATE_DIR"
kei runtime bootstrap
```

The workaround is safe until a `kei-proxy` release ships a macOS-aware
default. The state dir holds transient runtime data (policy bundle cache,
heartbeat timestamps); `0700` ensures other processes on the machine cannot
read it.

### 5. `kei policies list` returns a decode error on kei ≤ 0.1.10

**Symptom:**
```
kei policies list --workspace my-workspace
```
returns a JSON decode error or a stack trace instead of the policy list.

**Cause:** `kei policies` before v0.1.11 sent a malformed request that the
server could not decode. The command crashes before printing any results
(HAI-373).

**Fix:** Upgrade kei to v0.1.11 or later. If you cannot upgrade, use the
web app at `app.haikeilabs.com` to view and manage policies.

Answer with all of it, and connect the bug to the error the user saw: "The
JSON decode error is the known kei ≤ 0.1.10 bug (HAI-373): the server could
not decode the request." Then: upgrade to v0.1.11 or later; until then, use
the web app.

After upgrading to v0.1.11+, `kei policies list` works and all `kei policies`
subcommands accept a policy **name** in addition to ID:

```sh
kei policies list --workspace my-workspace --json
kei policies update my-policy-name --workspace my-workspace --dst-pattern tool:web_search
kei policies get my-policy-name --workspace my-workspace
kei policies delete my-policy-name --workspace my-workspace --yes
```

## Key guidelines

- **Nothing outside the usage string exists.** No `kei org` or `kei agent`
  commands; no group update or delete; no `bot install`, `deploy`, or
  `destroy`; no `kei setup doctor`. Orgs, agents, and groups are
  created and changed in the web app (or through the HTTP API — see
  `kei-api`). Say that plainly instead of guessing a command from an API route.
  `kei workspaces list|create` and `kei groups create|list` exist
  (v0.1.33+), and
  `kei connectors`, `kei policies`, `kei harness`, `kei model-profiles` and
  `kei credential-store` are the resource-oriented exceptions. Since v0.1.16,
  `kei users` (list, get, create, update, resolve, identities) and
  `kei groups members list|add|remove` manage users and group membership;
  `kei bot list` (v0.1.8) lists installations. Since v0.1.34,
  `kei connectors connect` connects your own per-user OAuth connector,
  `kei credential-store get|put` accept `--workspace` to read/write workspace
  overrides, and `kei connect` sets up a harness in one command.
  Check `kei help` for the installed version before presenting any of them as
  available.
- **Credentials never touch the terminal.** `kei bot credential` refuses to
  write to an interactive terminal; pipe it into a secret manager. Never pass a
  token as an argument unless the user accepts shell-history exposure.
- **The CLI does not provision infrastructure.** The customer owns hosting and
  secrets; the CLI registers and inspects control-plane metadata.
- **Every ID is a UUID.** `--installation` and `--agent` are validated as UUIDs
  before any request is made.
- **Before a resource command, verify three things:** the exact name in
  `kei help` (`kei policies`, plural), the installed version (`kei --version`),
  and the contract (opaque page tokens for `list`, PATCH with an update mask
  for `update`). Login is a precondition, not one of the three. See
  *When resource commands arrive* below.

## Quick reference

| Task | Command | Needs login |
| --- | --- | --- |
| Show commands for this version | `kei help` | no |
| Log in / out | `kei login [--no-browser]` / `kei logout` | — |
| List workspaces | `kei workspaces list [--json]` | yes |
| Create a workspace (v0.1.33+) | `kei workspaces create --name NAME [--json] [--yes]` | yes |
| Create a group (v0.1.33+) | `kei groups create --name NAME --workspace WORKSPACE [--description TEXT] [--json] [--yes]` | yes |
| List groups (v0.1.33+) | `kei groups list --workspace WORKSPACE [--json]` | yes |
| List runtime installations | `kei bot list [--json] [--all]` (v0.1.33+: shows VERSION column; flags `(below minimum)` when the installation's runtime version is below the org minimum; display-only, does not block the runtime) | yes |
| Create a runtime installation | `kei bot init --platform cli\|teams\|discord\|slack\|whatsapp\|openwebui --name NAME [--agent ID] [--workspace WS]` | yes |
| Emit the runtime credential | `kei bot credential --installation ID --workspace WORKSPACE \| <secret-manager import>` | yes |
| Rotate the runtime credential | `kei bot credential --installation ID --workspace WS --rotate \| <secret-manager import>` | yes |
| Inspect an installation | `kei bot status --installation ID` | yes |
| Activate after first heartbeat | `kei bot bind --installation ID` | yes |
| List / attach / detach agents | `kei bot agents list\|add\|remove --installation ID [--agent ID] [--default]` | yes |
| Delete an installation | `kei bot delete --installation ID --yes` | yes |
| List policies for a workspace | `kei policies list [--workspace WS] [--page-size N] [--json]` | yes |
| Get a policy | `kei policies get <name-or-id> [--workspace WS] [--json]` | yes |
| Create a harness command policy | `kei policies create --name NAME --src-pattern PATTERN --dst-pattern DST --effect permit\|deny [--priority N] [--agent-id ID]` | yes |
| Update a policy | `kei policies update <name-or-id> [--name N] [--src-pattern P] [--dst-pattern D] [--effect permit\|deny] [--priority N] [--enabled]` | yes |
| Delete a policy | `kei policies delete <name-or-id> --yes [--workspace WS]` | yes |
| Import native harness rules | `kei policies import --from claude\|codex\|opencode [--file PATH] [--src PATTERN] [--out FILE] [--apply] [--workspace WS]` | yes |
| List data connectors | `kei connectors list [--workspace WS] [--json]` | yes |
| Create a data connector | `kei connectors create --provider P --name NAME [--account-model M] [--set k=v] [--credential-ref R] [--capabilities a,b] [--workspace WS]` | yes |
| Connect your own per-user OAuth connector (v0.1.34+) | `kei connectors connect <id|name> --workspace WORKSPACE [--no-browser]` | yes |
| Get / reconnect / delete a connector | `kei connectors get ID [--json]` / `kei connectors reconnect ID [--no-browser] [--keep-secret]` (v0.1.34+: on per-user connectors, points to `kei connectors connect`) / `kei connectors delete ID --yes` | yes |
| Add a remote MCP server (v0.1.32+) | `kei connectors create --template TEMPLATE_ID --label LABEL [--kind mcp] [--slug S] [--mcp-url URL] [--expected-issuer URL] [--workspace WS]` | yes |
| Review an MCP connector's tool manifests (v0.1.32+; alias `tools`) | `kei connectors manifests list\|show CONNECTOR_ID [MANIFEST_ID] [--workspace WS] [--json]` | yes |
| Approve a tool manifest (org admin, v0.1.32+) | `kei connectors manifests approve CONNECTOR_ID MANIFEST_ID [--workspace WS] [--yes]` | yes |
| Register a custom/SDK harness | `kei harness add --kind custom [--installation ID] [--agent ID]` | yes |
| Sync tool registrations | `kei harness sync [--harness KIND] [--dry-run]` | yes |
| List registered harnesses | `kei harness list --installation ID [--json]` | yes |
| Remove a harness | `kei harness remove AGENT_ID --installation ID` | yes |
| List / get model profiles | `kei model-profiles list [--workspace WS]` / `kei model-profiles get PROFILE [--workspace WS]` | yes |
| Create a model profile (no credential) | `kei model-profiles create [--workspace WS] --display-name NAME --endpoint URL --default-model MODEL --auth-type none [--workspace-default]` | yes |
| Create an API-key model profile | `<secret-manager read> \| kei model-profiles create --workspace WS --agent AGENT_ID --display-name NAME --endpoint URL --default-model MODEL --auth-type api_key` | yes |
| Update / rotate a profile key | `kei model-profiles update PROFILE [--workspace WS] [--default-model M]` / `<secret-manager read> \| kei model-profiles update PROFILE --workspace WS --rotate-key` | yes |
| Set the default profile | `kei model-profiles set-default PROFILE [--workspace WS]` | yes |
| Assign / unassign / show an agent's profile | `kei model-profiles assign PROFILE --workspace WS --agent AGENT_ID` / `unassign\|assignment --workspace WS --agent AGENT_ID` | yes |
| Can runtimes reach the provider? | `kei model-profiles readiness PROFILE --workspace WS` | yes |
| Validate an endpoint like the console's Test button (no provider call) | `kei model-profiles test --endpoint URL` / `kei model-profiles test PROFILE [--workspace WS]` | `--endpoint`: no |
| Delete a model profile | `kei model-profiles delete PROFILE [--workspace WS] --yes` | yes |
| Credential store | `kei credential-store get [--workspace WS]` / `put [--workspace WS]` (creates it) / `update` (PATCH) (v0.1.34+: `--workspace` reads/writes the workspace override) | yes |
| Users (v0.1.16+) | `kei users list\|get\|create\|update\|resolve` / `kei users identities list USER` | yes |
| Group membership (v0.1.16+) | `kei groups members list\|add\|remove GROUP [USER] [--workspace WS]` | yes |
| Entra directory sync (after v0.1.29; workflow in `kei-directory-sync`) | `kei directory-sync get [--json]` / `set [--tenant-id G] [--client-id G] [--app-id G] [--dry-run=true\|false] [--create-users=true\|false] [--revoke=true\|false] [--yes]` / `enable\|disable [--yes]` / `report [--limit N] [--json]` | yes |
| One-command harness setup (v0.1.34+) | `kei connect HARNESS [--workspace NAME] [--yes]` (creates installation, credential, config, bootstrap, bind in one step) | yes |
| Write local runtime config | `kei setup [--config PATH] [--control-plane-url URL]` | no (runtime token) |
| Verify + heartbeat via local kei-proxy | `kei runtime bootstrap [--config PATH] [--proxy-path PATH]` | no (runtime token) |
| Upgrade via Go | `kei upgrade [--version VERSION]` | no |
| Report a bug (redacted harness transcript) | `kei feedback --description TEXT --export claude\|codex\|opencode [--session ID]` | yes |

All `bot` commands accept `--api-url URL` (override the default control-plane
URL). `bot bind` works but is not listed in `kei help`.

`kei harness` is **keyed by agent**, not by a surrogate harness ID: a harness
is a property of an installation-agent assignment, so `add` is for custom/SDK
harnesses (`--kind custom`) and requires `--agent` (the agent must already be
attached to the installation via `kei bot agents add`). Desktop harnesses
(`claude_code`, `codex`, `opencode`) are **auto-discovered** by `kei harness
sync` — do NOT use `add` for them. `--installation` and `--agent` are optional
with defaults (single installation, default agent). `remove`/`sync` are
addressed by the agent. There is no `--display-name`/`--name` flag. The console
labels these harnesses "agents". For the full harness-command-policy workflow,
load **`kei-harness-policy`**.

`kei harness sync` backs up each native config it changes to
`<file>.kei-backup-<timestamp>` and each skill it replaces under
`skill-backups/` in the sync ledger dir. From kei 0.1.31 it keeps **one**
backup per file and per skill: the state from before the most recent
successful sync. The next successful sync removes the older one, a failed sync
rolls back and leaves it untouched, and `--dry-run` prints
`Would remove earlier Kei backup <path>`. To roll back by hand, copy the
`.kei-backup-<timestamp>` file over the native config.

## MCP connectors and tool manifests

These need `kei` v0.1.32 or later (older releases do not have them):
check `kei help` first. Depth is
in [references/mcp-connectors.md](references/mcp-connectors.md).

- **Create from a template.** `kei connectors create --template TEMPLATE_ID
  --label LABEL` reads the template from the catalog; the CLI keeps no
  template list. `--kind mcp` only checks the template's kind. Pass
  `--mcp-url https://…` when the template has no URL (`custom_mcp`), `--slug`
  to choose the immutable slug (it defaults to one derived from the label),
  and `--expected-issuer` to pin the OAuth authorization server. When you give
  the create command, also say that each user then connects their own account
  with OAuth (per user, so nothing is read from stdin) using `kei connectors
  connect` (v0.1.34+) and that the connector's tools stay blocked until an
  admin approves its tool manifest.
- **Catalog too old for `--expected-issuer`.** When the remote catalog doesn't
  support `--expected-issuer`, the CLI creates the connector without the issuer
  pin but then fails closed: it deletes the connector rather than leave one
  that trusts any authorization server. To fix this, upgrade the catalog (the
  platform side), or re-create the connector without `--expected-issuer` if
  that risk is acceptable.
- **Tools come only from the approved manifest.** The runtime submits each
  manifest it observes as a candidate. Review it with
  `kei connectors manifests show CONNECTOR_ID` (newest candidate, with tools
  added `+`, removed `-` and changed `~`). An org owner or admin approves it
  with `kei connectors manifests approve CONNECTOR_ID MANIFEST_ID`. That needs
  the manifest ID, shows the changes, and asks before approving (`--yes` in
  scripts). `tools` is an alias for `manifests`.
- `kei connectors get` shows an mcp connector's slug, MCP URL, issuer and
  manifest status; `kei connectors list --manifests` adds a status column.

## Connecting your own per-user OAuth connector (v0.1.34+)

`kei connectors connect` connects **your own** per-user OAuth connector
(GitHub, Linear, Google Drive, etc.). It starts the OAuth bridge sign-in for
the running user only; connecting another user's account is denied.

```sh
kei connectors connect <id|name> --workspace WORKSPACE [--no-browser]
```

- Opens the browser to the OAuth authorization page, or prints the URL with
  `--no-browser`.
- Polls until the connection completes (up to 10 minutes).
- Prints the connection **state** and the **granted scopes** on success.
- **Never prints a token.** The OAuth token stays server-side; the CLI shows
  only state and scopes.
- **Other users' accounts are denied.** The command is for the authenticated
  user only. To connect another user, that user must run `kei connectors
  connect` themselves after `kei login`.
- `kei connectors reconnect` on a per-user connector now points to `kei
  connectors connect` instead of the old "users connect through their chat
  harness" message.

## Model profiles and the credential store

Model profiles and the credential store are organization resources
(`/api/v1/organizations/{org}/...`); the organization is the one your `kei
login` token is bound to. Pass `--workspace` (name or ID) for a workspace's
profiles; omit it for organization-level profiles. `PROFILE` is an ID or a
display name; `--agent` takes an agent ID. Writes require an org admin.

- **API keys come from stdin only.** They are never accepted as a flag and
  never printed. Pipe them from a secret manager (or type them at the no-echo
  prompt). The CLI seals the key to the runtimes in the profile's scope (the
  agent's runtimes, or the workspace's for a workspace default) with the same
  KMP1 envelope as connector secrets, and sends only the sealed copies. If no
  runtime is eligible, `create` fails before creating anything.
- `create` requires `--default-model`; `--auth-type` is `none` or `api_key`.
- The credential store must exist before an API-key profile: `kei
  credential-store put` creates it, `update` changes it. Without one,
  `create` fails with `no active credential store; configure one with kei
  credential-store put`.

When someone asks for the command to create an API-key profile, answer in
this order: (1) the credential store must exist first, created with
`kei credential-store put`; (2) pipe the key from the secret manager into
`kei model-profiles create` with `--default-model` and `--auth-type api_key`
(plus `--workspace`/`--agent` for scope); (3) check it with
`kei model-profiles readiness`.

**Workspace overrides (v0.1.34+).** `kei credential-store get --workspace WS`
and `kei credential-store put --workspace WS` read or write a workspace-level
credential store override, separate from the organization-level store. Without
`--workspace`, the commands address the organization store. If no override
exists for a workspace, `get --workspace WS` reports that the workspace uses
the organization's store.
- `kei model-profiles test` (v0.1.14 or later) does what the console's
  **Test** button does: it validates the endpoint (`https`, a host, no embedded
  credentials, query, or fragment) and **never contacts the provider**.
  `test --endpoint URL` needs no login; `test PROFILE` checks a stored
  profile's endpoint. Before v0.1.14 it exited with an error. It cannot tell
  you whether the model is reachable: use `readiness` for that.
- **kei ≤ 0.1.12:** `kei model-profiles` and `kei credential-store` call
  retired console routes and fail. Upgrade to v0.1.13 or later.

## Runtime installations

An installation is one customer-owned runtime boundary: the scope for
bootstrap, heartbeats, policy delivery, and audit. It is distinct from a user
login.

```sh
kei bot init --platform cli --name "Acme local runtime"
```

- `--platform` and `--name` are required; there is no default platform. v0.1.4+
  accepts `cli`, `teams`, `discord`, `slack` (earlier releases and some console
  pages omit `cli`). Use `cli` for a local coding-harness runtime. `discord` is
  for Haikei-internal harnesses only.
- The output includes the non-secret `installation_id`. No credential is
  printed here.
- `bot delete` removes the control-plane installation and revokes its
  credential immediately; it never touches customer cloud resources.
- **A `pending` status is evidence about the heartbeat, not proof of health.**
  `kei bot status --installation ID` shows `pending` until the runtime's first
  heartbeat reaches the control plane. When diagnosing a pending runtime, say
  so, then collect read-only evidence: the `kei bot status` output, whether
  the runtime process and its heartbeat loop are running, its logs, and
  whether it can reach the control plane. Never print or paste the runtime
  credential to check it.

For the full stand-up sequence (credential → config → bootstrap → heartbeat →
bind → fail-closed check), load **`kei-runtime-setup`**.

## Runtime credential

```sh
kei bot credential --installation ID --workspace WORKSPACE | <secret-manager import>
```

- Emitted once for a new installation. If one already exists the command fails
  with `bot credential already exists; use --rotate to replace it`.
- `--workspace` accepts a workspace name or ID. The credential is scoped to
  that workspace. If omitted, the existing workspace (set at installation
  creation) is used.
- `--rotate` replaces the credential in place; the old one stops working
  immediately. Load **`kei-credential-rotation`** before rotating a runtime
  that is serving traffic.

## Local runtime: `kei setup` + `kei runtime bootstrap`

This is the current way to bring up a runtime on a workstation. `kei setup`
saves the runtime settings; `kei runtime bootstrap` runs the bundled
`kei-proxy runtime bootstrap` with those settings passed in its environment
(it finds `kei-proxy` via the configured path, then `PATH`). A deployed
runtime runs `kei-proxy runtime bootstrap` itself with env from its secret
manager — see `kei-runtime-setup` and `kei-proxy`.

```sh
kei setup                      # prompts; verifies the runtime token; writes ~/.config/kei.yaml (0600)
<secret-manager read> | kei setup --control-plane-url https://app.haikeilabs.com   # token from a pipe, nobody pastes it
kei runtime bootstrap          # runs the configured kei-proxy to verify + send a heartbeat
```

`kei setup` also takes `--harness-url` (default `http://127.0.0.1:8088`),
`--proxy-path`, `--proxy-registry`, `--model-endpoint`, `--model`,
`--runtime-token` (lands in shell history — prefer the prompt), and
`--skip-verify`.

## One-command harness setup: `kei connect` (v0.1.34+)

`kei connect` sets up a harness end-to-end in a single command: creates the
runtime installation, emits the credential, writes local config (`kei setup`),
bootstraps (`kei runtime bootstrap`), and binds the installation — all in one
step.

```sh
kei connect cli [--workspace NAME] [--yes]
kei connect openwebui [--workspace NAME] [--yes]
```

- `HARNESS` is a harness kind: `cli`, `openwebui`, etc.
- `--workspace` scopes the installation to a workspace (name or ID). If
  omitted, the caller's default workspace is used.
- `--yes` skips confirmation prompts.
- The command authenticates with the `kei login` session token (login
  first).
- For the individual steps or when more control is needed, use the
  per-command sequence (`kei bot init` → `kei bot credential` → `kei setup`
  → `kei runtime bootstrap` → `kei bot bind`) — see `kei-runtime-setup`.

## Report a bug from your harness

`kei feedback` sends a bug report to Kei from the terminal, optionally with the
harness session transcript attached. It needs `kei` 0.1.20 or later for
`--export` and a `kei login` session. Run it from the project directory the
harness session ran in: without `--session`, `--export` picks the most recent
session for the current working directory. `--description` is required (1 to
4000 characters).

```sh
kei feedback --description "What happened and what you expected" --export claude     # Claude Code
kei feedback --description "What happened and what you expected" --export codex      # Codex
kei feedback --description "What happened and what you expected" --export opencode   # OpenCode (runs opencode export)
kei feedback --description "..." --export claude --session <session-id>               # a specific session
kei feedback --description "..." --session /path/to/transcript.jsonl                  # any harness: transcript file(s)
kei feedback --description "..." --file app.log --screenshot error.png               # other evidence
```

- With `--export`, `--session` is one session ID; without it, `--session` is a
  repeatable transcript file path. At most 8 evidence files, 4 MiB in total.
- **Transcripts are redacted before anything is sent.** Token-shaped strings
  (Anthropic and OpenAI keys, GitHub and Slack tokens, AWS keys, JWTs,
  `Bearer` tokens, private-key blocks, Kei runtime tokens, and
  `password=`/`token=`/`secret=` style values) become `[REDACTED:<kind>]`.
  `--file` and `--screenshot` are sent as they are.
- **The user previews and confirms.** The CLI prints the description, each
  file with its size and the redaction counts per kind (never the content),
  then asks `Send? [y/N]`. Anything other than `y`/`yes` prints
  `Feedback not submitted.` and sends nothing. `--yes` skips the prompt; an
  agent must not add it. Give the user the command to run instead. When
  explaining `kei feedback`, include this sentence: "You preview the report
  (description, files, redaction counts) and must confirm at `Send? [y/N]`;
  answering no sends nothing."
- A Kei runtime token in a transcript triggers a leak warning: rotate it with
  `kei bot credential --rotate` (see `kei-credential-rotation`).

The **Report a bug** button in the console header sends to the same place.
Per-harness detail is in `kei-harness-setup`.

## When resource commands arrive (AIP/CRUD)

The CLI is being extended toward the resource-oriented Kei API contract, but
no released version has org or agent commands yet (`kei workspaces list|create`,
`kei groups create|list`, `kei connectors`, `kei policies`, `kei harness`,
`kei model-profiles` and `kei credential-store` are the resource-oriented
exceptions, all in v0.1.13; `kei users` and `kei groups members` arrived in
v0.1.16; `kei workspaces create` and `kei groups create|list` arrived in
v0.1.33; `kei connectors connect` and `kei credential-store get|put --workspace`
arrived in v0.1.34).
The first resource-oriented commands call the **shared AIP `/api/v1`
endpoints**, not a private `/api/cli` backend: `kei policies` uses
`/api/v1/policies`, `kei connectors` uses `/api/v1/data-connectors`, and
`kei model-profiles` uses `/api/v1/organizations/{org}/model-profiles` (with
`:setDefault`; model-profile update is still `PUT` in the API today).
Before using or documenting one, confirm it in `kei help`
for the installed version and check that it follows the contract:

- `list` / `get` / `create` / `update` / `delete` map to the API's List, Get,
  Create, Update, and Delete;
- `update` uses PATCH semantics with an explicit update mask, never a full
  replace;
- `list` uses opaque page tokens and returns the next page token, not offsets;
- errors keep a stable machine-readable reason;
- non-CRUD state changes are explicit `:verb` custom methods (for example
  `:rotate`), not guessed subpaths.

Until the command exists and is tested, use the web app or `kei-api`. Do
not describe a future command as available.

When someone asks what to verify before running a resource command, answer
with all three (login is a precondition, not one of them):

1. The **exact name** in `kei help`: it is `kei policies`, plural; there is
   no `kei policy`.
2. The **installed version**: `kei --version`; for example `kei policies list`
   needs v0.1.11 or later.
3. The **contract** above: opaque page tokens for `list`, PATCH with an
   update mask for `update`.

## Validation commands

```sh
kei --version
kei help                                  # authoritative usage for this version
kei bot                                   # "bot requires a subcommand" (exit 2)
kei login --no-browser
kei bot status --installation INSTALLATION_ID
```

## Realistic usage boundaries

- Organization, agent, connector, invitation, and
  approval management happen in the web app today (`kei workspaces list` is
  available for workspace discovery). The CLI will grow
  resource-oriented commands after the API's AIP migration; until a release
  ships one, do not describe it as available.
  **Exception:** `kei policies`, `kei harness`, `kei model-profiles` and `kei
  credential-store` are released resource-oriented commands (v0.1.13),
  `kei users` / `kei groups members` are released in v0.1.16,
  `kei workspaces create` / `kei groups create|list` are released in v0.1.33,
  and `kei connectors connect` / `kei credential-store get|put --workspace`
  are released in v0.1.34. For harness policy workflows, load the
  `kei-harness-policy` skill.
- The CLI does not submit tool manifests (the runtime does), create connector
  templates, or grant a connector to a group (that is a policy). `--provider`
  has no `grafana` (or other MCP) value: an MCP server is added with
  `--template`.
- The CLI token is org-bound and short-lived; it is not a general user token and
  cannot be used by a runtime.
- The **Keys** page no longer exists. Agent keys were deprecated in favor of
  the runtime installation credential for all runtime operations.
- AWS, GCP, Azure, Terraform, and Helm deployment steps are not part of the
  CLI. Kei's own control plane runs on AWS EKS; customer hosting is the
  customer's choice.
