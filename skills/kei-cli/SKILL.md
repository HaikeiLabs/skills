---
name: kei-cli
description: The `kei` platform-administration CLI for Kei (run by an org owner/admin, not by agents) — install/upgrade, `kei login` device-flow auth, runtime installations (`kei bot init|credential|agents|status|bind|delete`), and local runtime config (`kei setup`, `kei runtime bootstrap`). Load before running or suggesting any `kei` command so syntax, flags, and auth are right, and whenever someone asks how to do something "from the CLI" in Kei. Biases toward the installed binary's help and the Kei console docs over this file. There are no org, workspace, agent, connector, policy, or user commands — say so rather than inventing one. For how an agent's tool calls are allowed or denied at run time, use kei-proxy instead.
---

# kei CLI

`kei` is the Kei **platform administration** CLI. It authenticates an org
owner/admin and manages **runtime installations** — the identity a
customer-hosted runtime uses. It is not how agents interact with Kei at run
time; that is `kei-proxy`.

| | `kei` — platform admin (this skill) | `kei-proxy` — runtime for agent interaction |
| --- | --- | --- |
| Who runs it | A person: org `owner`/`admin` | The harness, as a subprocess, per governed operation |
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
| Kei console docs | `https://app.haikeilabs.com/#/docs/getting-started`, `#/docs/create-an-organization` (CLI authentication and identity), `#/docs/add-a-workspace` (proxy runtime) | The customer-facing, supported workflow |
| Release endpoint | `https://kei-cli-releases.s3.us-east-1.amazonaws.com/kei-cli/latest.txt` | Latest published version |

When this skill and `kei help` disagree, **trust `kei help`** and mention the
difference to the user.

## FIRST: check that `kei` is installed

```sh
kei --version     # prints "kei <version>"
```

If it is missing, install with the checksum-verifying release installer
(macOS and Linux, arm64 and amd64). This is the recommended path:

```sh
export PATH="$HOME/.local/bin:$PATH"
curl -fsSL "https://kei-cli-releases.s3.us-east-1.amazonaws.com/kei-cli/install.sh" \
  | bash -s -- -d "$HOME/.local/bin"
kei help && kei --version
```

Pin a release with `-v VERSION` (no leading `v`, e.g. `-v 0.1.5`). Rerun the
installer to upgrade. Since v0.1.4 the release archive also carries a pinned
`kei-proxy` (the runtime), and the installer puts it next to `kei`, so a
workstation gets both binaries from one install. `go install` builds only
`kei`.

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
kei login --api-url https://app.haikeilabs.com                  # opens a browser
kei login --api-url https://app.haikeilabs.com --no-browser     # headless: prints URL + code
```

- It is an OAuth **device flow**. The CLI prints a URL and a verification code;
  a person approves it in a signed-in browser. As an agent, run the command,
  show the user the URL and code, and wait — you cannot approve it for them.
- Only an org `owner` or `admin` can complete approval. Others can start the
  flow but are refused with `403 organization administrator role is required`.
  Don't hand the CLI to a non-admin.
- The token is bound to the organization chosen at approval and to the
  `--api-url` host (default `https://app.haikeilabs.com`, or `KEI_WEB_URL`).
  Use the same `--api-url` on every later command.
- The token goes to the OS keychain (service `kei-cli`, account = API host).
  It is never printed and never written to a config file.
- It is short-lived. `not logged in; run kei login first` or a 401 mid-session
  means log in again and retry.
- `kei logout --api-url URL` removes the local keychain entry only; it does not
  revoke the token server-side. Safe to repeat.

Commands that do **not** need `kei login`: `kei setup`, `kei runtime
bootstrap`, `kei upgrade`, `kei help`, `kei --version`. The first two
authenticate with the runtime token instead.

## Key guidelines

- **Nothing outside the usage string exists.** No `kei org`, `workspace`,
  `agent`, `connector`, `group`, `policy`, `user`, or `key` commands; no
  `bot install`, `deploy`, `destroy`, or `list`; no `kei setup doctor`. Orgs,
  workspaces, agents, agent keys, connectors, and policies are managed in the
  web app (or through the HTTP API — see `kei-api`). Say that plainly
  instead of guessing a command from an API route.
- **Credentials never touch the terminal.** `kei bot credential` refuses to
  write to an interactive terminal; pipe it into a secret manager. Never pass a
  token as an argument unless the user accepts shell-history exposure.
- **The CLI does not provision infrastructure.** The customer owns hosting and
  secrets; the CLI registers and inspects control-plane metadata.
- **Every ID is a UUID.** `--installation` and `--agent` are validated as UUIDs
  before any request is made.

## Quick reference

| Task | Command | Needs login |
| --- | --- | --- |
| Show commands for this version | `kei help` | no |
| Log in / out | `kei login [--api-url URL] [--no-browser]` / `kei logout [--api-url URL]` | — |
| Create a runtime installation | `kei bot init --platform cli\|teams\|discord\|slack --name NAME [--agent ID]` | yes |
| Emit the runtime credential | `kei bot credential --installation ID \| <secret-manager import>` | yes |
| Rotate the runtime credential | `kei bot credential --installation ID --rotate \| <secret-manager import>` | yes |
| Inspect an installation | `kei bot status --installation ID` | yes |
| Activate after first heartbeat | `kei bot bind --installation ID` | yes |
| List / attach / detach agents | `kei bot agents list\|add\|remove --installation ID [--agent ID] [--default]` | yes |
| Delete an installation | `kei bot delete --installation ID --yes` | yes |
| Write local runtime config | `kei setup [--config PATH] [--control-plane-url URL]` | no (runtime token) |
| Verify + heartbeat via local kei-proxy | `kei runtime bootstrap [--config PATH] [--proxy-path PATH]` | no (runtime token) |
| Upgrade via Go | `kei upgrade [--version VERSION]` | no |

All `bot` commands accept `--api-url URL`. `bot bind` works but is not listed in
`kei help`.

## Runtime installations

An installation is one customer-owned runtime boundary: the scope for
bootstrap, heartbeats, policy delivery, and audit. It is distinct from a user
login and from an agent key.

```sh
kei bot init --platform cli --name "Acme local runtime"
```

- `--platform` and `--name` are required; there is no default platform. v0.1.4+
  accepts `cli`, `teams`, `discord`, `slack` (earlier releases and some console
  pages omit `cli`). Use the platform documented for your runtime.
- The output includes the non-secret `installation_id`. No credential is
  printed here.
- `bot delete` removes the control-plane installation and revokes its
  credential immediately; it never touches customer cloud resources.

For the full stand-up sequence (credential → config → bootstrap → heartbeat →
bind → fail-closed check), load **`kei-runtime-setup`**.

## Runtime credential

```sh
kei bot credential --installation ID | <secret-manager import>
```

- Emitted once for a new installation. If one already exists the command fails
  with `bot credential already exists; use --rotate to replace it`.
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

`kei setup` also takes `--harness-url`,
`--proxy-path`, `--proxy-registry`, `--model-endpoint`, `--model`,
`--runtime-token` (lands in shell history — prefer the prompt), and
`--skip-verify`.

## When resource commands arrive (AIP/CRUD)

The CLI is being extended toward the resource-oriented Kei API contract, but
no released version has org, workspace, agent, connector, group, policy, or
user commands yet. Before using or documenting one, confirm it in `kei help`
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

## Validation commands

```sh
kei --version
kei help                                  # authoritative usage for this version
kei bot                                   # "bot requires a subcommand" (exit 2) — confirms no list/deploy
kei login --api-url https://app.haikeilabs.com --no-browser
kei bot status --installation INSTALLATION_ID
```

## Realistic usage boundaries

- Organization, workspace, agent, agent-key, connector, policy, invitation, and
  approval management happen in the web app today. The CLI will grow
  resource-oriented commands after the API's AIP migration; until a release
  ships one, do not describe it as available.
- The CLI token is org-bound and short-lived; it is not a general user token and
  cannot be used by a runtime.
- `kei` does not mint agent (`kh_live_…`) keys; those come from the console's
  **Agents → Keys**.
- AWS, GCP, Azure, Terraform, and Helm deployment steps are not part of the
  CLI. Kei's own control plane runs on AWS EKS; customer hosting is the
  customer's choice.
