---
name: kei-cli
description: Use the kei CLI (the standalone kei-cli repository) for customer-hosted Kei bot runtimes. Use when running kei setup, kei runtime bootstrap, kei login/logout, kei upgrade, or kei bot commands — init, credential, agents list/add/remove, status, bind, delete — for registering and managing Kei bot runtimes on Microsoft Teams/Azure. Covers the admin-only, org-bound OIDC device-authorization login. Do not use for org/workspace/connector/group/policy/user management: those commands do not exist; org management lives in the ABAC API (kei-abac-api skill).
---

# kei CLI (deployment CLI)

The `kei` CLI provisions and manages customer-hosted Kei bot runtimes. The MVP
supports Microsoft Teams on Azure. The customer owns the Azure subscription,
resource group, Key Vault, and deployed runtime; Kei provides the control-plane
installation and runtime image.

Source of truth: `main.go` (`printUsage`) and `README.md` at the root of the
**`kei-cli` repository** (Go module `github.com/HaikeiLabs/kei-cli`). This is a
standalone repository — the CLI is not built from `kei/cmd/kei`, which does not
implement this command surface. Every command and flag below is traceable to
those files. **There are no other commands.** In particular there is no `org`,
`workspace`, `connector`, `group`, `policy`, or `user` command — org management
is done through the ABAC API (see the `kei-abac-api` skill) — and no
`kei setup doctor`: diagnosis is the `kei-setup-doctor` skill's workflow, not a
subcommand.

## Who can use this CLI

The CLI is **admin-only and org-bound**. Only a member whose role is `owner` or
`admin` in the target organization can complete `kei login`. This is enforced in
two places (defense in depth):

1. `cmd/abac-engine/cli_device_auth.go` — the device-authorization approve
   handler selects the member role for `(org_id, user_id)` and refuses anything
   but `owner` or `admin` with **403 "organization administrator role is
   required"**.
2. `cmd/web/main.go` — the browser-facing approve handler independently checks
   the signed-in user's administrated organizations and refuses others, with a
   constant-time CSRF check.

A non-admin **can** start a device flow, but the approval is refused. Do not
hand the CLI to a non-admin expecting a usable token; they will hit the 403
above.

The CLI bearer token is **bound to the org selected at approval time**: the
approval row records both `approved_user_id` and `org_id`, so the token grants
access to that one org only. It is not a generic user token.

## Login: OIDC/SSO device flow

`kei login` runs an OAuth device flow. It does not print a token and does not
store one in a config file.

```sh
kei login [--api-url URL]
```

- Defaults to `https://app.haikeilabs.com`, overridable with `--api-url URL`
  (absolute http(s) URL, no query or fragment) or the `KEI_WEB_URL` env var.
- The CLI starts a device authorization, prints a browser URL and a one-time
  verification code:
  - `POST /api/cli/device/authorize` (web app), which maps to
    `/api/v1/internal/cli-device-authorizations` on the ABAC engine.
  - Prints `Open this URL in a browser and approve the CLI:` plus
    `Verification code: <code>`.
- An **owner/admin approves the code in an authenticated browser session**
  (OIDC/SSO). Approval goes through `/api/v1/internal/cli-device-authorizations/approve`.
- The CLI polls `/api/cli/device/token` (`/poll`) until `approved`, `denied`,
  or `expired`.
- On approval the access token is written to the **OS keychain** (service
  `kei-cli`, account = host of `--api-url`) and **never printed**. It is sent
  as `Authorization: Bearer` on subsequent calls.
- The token is short-lived. Re-run `kei login` before a retry if a long Azure
  deployment ends with a 401 from the Kei API.

## Command surface

Exact usage from `printUsage` in the `kei-cli` repository's `main.go`:

```
kei setup [--config PATH] [--control-plane-url URL] [--runtime-token TOKEN]
kei runtime bootstrap [--config PATH] [--proxy-path PATH]
kei login [--api-url URL] [--no-browser]
kei logout [--api-url URL]
kei upgrade [--version VERSION]
kei bot init --platform teams|discord|slack --name NAME [--agent ID] [--api-url URL]
kei bot credential --installation ID [--rotate] [--api-url URL]
kei bot agents list|add|remove --installation ID [--agent ID] [--default] [--api-url URL]
kei bot status --installation ID [--api-url URL]
kei bot delete --installation ID --yes [--api-url URL]
kei --version
```

The `bot` dispatch also accepts `bind` (`kei bot bind --installation ID
[--api-url URL]`), which activates an installation after its deployed runtime
has reported a heartbeat; it is not listed in `printUsage`.

There is **no `kei bot install`, `deploy`, `destroy`, or `list`**, and no
`kei setup doctor`. Cloud provisioning is not performed by the CLI.

### Workflow in practice

- **Register the installation**: `kei bot init --platform teams --name "..."`
  creates the public installation metadata and returns a non-secret
  `installation_id`. Runtime credentials are not printed here.
- **Provision the runtime**: done **outside the CLI** — the CLI has no
  `install`, `deploy`, or `destroy` command and does not apply cloud templates.
  The customer (or the operator, in the customer's account) stands up the host,
  and the runtime itself is configured with `kei setup` and started via
  `kei runtime bootstrap`.
- **Deliver the credential**: `kei bot credential --installation ID` (with
  `--rotate` to replace it) emits the runtime credential for piping into the
  customer's secret manager. Never echo it to a terminal or transcript.
- **Activate**: `kei bot bind --installation ID`, once the deployed runtime has
  reported a heartbeat. Binding is deliberately explicit.
- **Inspection**: `kei bot status --installation ID` and
  `kei bot agents list --installation ID`.
- **Teardown**: `kei bot delete --installation ID --yes` removes the
  control-plane installation. It does **not** delete customer cloud resources —
  Key Vaults, secrets, and tenant-level Microsoft Entra app registrations are
  the customer's to remove.
- The CLI talks to the web app at `/api/cli/runtime-installations*`, which maps
  to `/api/v1/internal/runtime-installations*` on the ABAC engine.

### Flags beyond the usage string

`printUsage` is the compact surface; individual commands accept a few more
flags, defined next to each command in the `kei-cli` repository root
(`setup.go`, `runtime.go`, `agents.go`, `delete.go`, `bind.go`). Notable ones:

- `kei setup` also takes `--harness-url` (default `http://127.0.0.1:8088`),
  `--proxy-path`, `--proxy-registry`, `--model-endpoint`, `--model`, and
  `--skip-verify` (do not verify the runtime token against Kei). Prefer the
  interactive prompt over `--runtime-token` so the token stays out of the shell
  history.
- `kei runtime bootstrap` takes `--config` and `--proxy-path` (overrides the
  configured `kei-proxy` path).
- `bot agents add|remove` takes `--default` (make this the default agent).
- `bot delete` requires `--yes` to confirm permanent deletion.
- `bot bind` takes `--installation` (must be a UUID) and `--api-url`.

Verify against the installed binary with `kei --help` and
`kei <command> --help` rather than trusting this list across versions.

### Platforms

`bot init` **requires** `--platform`, and validates it against exactly
`teams`, `discord`, or `slack` — any other value, including `cli`, is rejected
with `bot init requires --platform teams|discord|slack and --name NAME`. The
flag has no default, so it cannot be omitted.

Accepting a platform at registration is not the same as a supported deployment
path: Teams on Azure is the MVP. Treat `discord` and `slack` as registerable
but not an implemented end-to-end runtime, and confirm before promising either.

## Install

Install the published `kei` binary on macOS or Linux (arm64 and amd64) with the
checksum-verifying release installer:

```bash
export PATH="$HOME/.local/bin:$PATH"
curl -fsSL "https://kei-cli-releases.s3.us-east-1.amazonaws.com/kei-cli/install.sh" \
  | bash -s -- -d "$HOME/.local/bin"
```

The installer resolves the latest version from `latest.txt`, verifies the
downloaded archive against its SHA-256 checksums, and installs `kei`. Pin a
release with `-v VERSION` (for example `-v 0.2.0`; do not include a leading
`v`). Rerun the command to upgrade. Verify the installation with:

```bash
command -v kei
kei help
kei --version
```

Rerun the installer to upgrade from S3. When Go is installed, the binary also
supports `kei upgrade` and `kei upgrade --version VERSION` through the Go
module proxy. For development or when the published installer is unavailable,
build from a checkout of `kei-cli` and put the binary on your PATH as `kei`:

```bash
go build -o tmp/kei .
```

The published installer is the supported customer installation path; the
source build is for development and diagnostics.

## Prerequisites

1. Install and sign in to the Azure CLI:
   `az login`; `az account set --subscription SUBSCRIPTION_ID`.
2. Register the resource providers used by the Azure template
   (`Microsoft.KeyVault`, `Microsoft.ManagedIdentity`,
   `Microsoft.OperationalInsights`, `Microsoft.App`, `Microsoft.BotService`).
3. Log in to Kei: `kei login --api-url https://app.haikeilabs.com`.

The operator needs Azure provider-registration and resource create/update
permissions, Key Vault secret read/write, and Entra app create/update rights.
The deployed identity receives only `Key Vault Secrets User`; it does not get
Azure resource-management permissions.

## Validation commands

```bash
# Build from source (a checkout of the kei-cli repo):
go build -o tmp/kei .

# Confirm the exact command surface (source of truth):
tmp/kei help                       # prints printUsage
tmp/kei login --help               # -api-url, -no-browser flags
tmp/kei setup --help               # runtime configuration flags
tmp/kei runtime bootstrap --help   # -config, -proxy-path
tmp/kei bot                        # lists subcommands: init agents status delete credential bind
#   ("bot requires a subcommand", exit 2 — there is no install/deploy/destroy/list)

# Confirm the auth flow against a deployment:
tmp/kei login --api-url https://app.haikeilabs.com
#   -> prints URL + verification code; approve as owner/admin in a browser
#   -> "Logged in to Kei for organization <org_id>."

# Confirm a runtime installation round-trips:
tmp/kei bot init --name "Test" --platform teams
tmp/kei bot status --installation INSTALLATION_ID
tmp/kei bot agents list --installation INSTALLATION_ID

# Confirm the commands this repo says do NOT exist really do not:
tmp/kei bot list                   # -> unknown bot command "list"
tmp/kei setup doctor               # -> setup accepts no positional arguments
```

## Realistic usage boundaries

- **Do not** invent org/workspace/connector/group/policy/user commands. They do
  not exist; org management is via the ABAC API. Say so plainly.
- **Do not** tell a non-admin to log in. Approval is refused with 403
  "organization administrator role is required"; a non-admin can start a device
  flow but can never complete it.
- **Do not** treat the CLI token as generic. It is org-bound at approval time
  and short-lived; a long Azure operation can outlive it (re-run `kei login`).
- **Do not** expect the token on stdout or in a config file. It goes to the OS
  keychain only and is never printed.
- **Do not** treat the runtime credential as CLI-visible. `bot init` creates
  public installation metadata only; the runtime credential is emitted by
  `bot credential` for piping into the customer secret manager, never echoed to
  terminal output or a transcript.
- **Do not** name a command that is not in `printUsage` plus `bot bind`. There
  is no `bot install`, `bot deploy`, `bot destroy`, `bot list`, or
  `kei setup doctor`. `bot delete` is the teardown command, and it removes only
  the control-plane installation — customer cloud resources are not touched.
- **Do not** assume the CLI provisions cloud infrastructure. It does not apply
  templates or create Azure resources; the runtime is configured with
  `kei setup` and started with `kei runtime bootstrap`.
- AWS, GCP, and Terraform/Helm deployment paths are **not** implemented; Azure +
  Teams is the MVP.
