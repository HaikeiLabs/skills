---
name: kei-cli
description: Use the kei deployment CLI for customer-hosted Kei bot runtimes. Use when running kei login or kei bot commands — init, install azure, agents list/add/remove, deploy azure, status, destroy azure — for provisioning and managing Kei bot runtimes on Microsoft Teams/Azure. Covers the admin-only, org-bound OIDC device-authorization login. Do not use for org/workspace/connector/group/policy/user management: those commands do not exist; org management lives in the ABAC API (kei-abac-api skill).
---

# kei CLI (deployment CLI)

The `kei` CLI provisions and manages customer-hosted Kei bot runtimes. The MVP
supports Microsoft Teams on Azure. The customer owns the Azure subscription,
resource group, Key Vault, and deployed runtime; Kei provides the control-plane
installation and runtime image.

Source of truth: `cmd/kei/main.go` (`printUsage`), `cmd/kei/README.md` in the
kei repo. Every command and flag below is traceable to those files. **There are
no other commands.** In particular there is no `org`, `workspace`, `connector`,
`group`, `policy`, or `user` command — org management is done through the ABAC
API (see the `kei-abac-api` skill).

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

Exact usage from `printUsage`:

```
kei login [--api-url URL]
kei bot init --name NAME [--platform cli|teams|discord|slack] [--agent ID] [--api-url URL]
kei bot agents list|add|remove --installation ID [--agent ID] [--default] [--api-url URL]
kei bot status --installation ID [--api-url URL]
kei bot install azure --name NAME [--platform teams] [--agent ID] [--resource-group NAME] [--location REGION] [--key-vault NAME] --runtime-control-plane-url URL --image OCI_IMAGE [--teams-manifest PATH]
kei bot deploy azure --installation ID --resource-group NAME --location REGION --key-vault NAME --runtime-control-plane-url URL --image OCI_IMAGE [--create-resource-group] [--create-key-vault] [--create-teams-app --teams-app-display-name NAME]
kei bot deploy azure --installation ID --resource-group NAME --location REGION --key-vault NAME --teams-app-password-secret NAME --teams-app-id ID --teams-tenant-id ID --runtime-control-plane-url URL --image OCI_IMAGE [--teams-manifest PATH]
kei bot destroy azure --installation ID [--resource-group NAME] [--environment-name NAME] [--delete-environment] [--preserve-installation] [--confirm-destroy ID] [--api-url URL]
```

### Workflow in practice

- **One-shot install** (`bot install azure`): creates the pending Kei
  installation, creates or reuses the Azure resource group and Key Vault,
  creates or reuses a Microsoft Entra app, writes the Teams password and Kei
  runtime credential to Key Vault, applies the Bicep template, waits for a
  runtime heartbeat, and binds the installation.
- **Split install/deploy**: `bot init --platform teams --name "..."` creates
  public installation metadata (runtime credentials are intentionally created
  later by `bot deploy` and delivered to the customer secret manager, never to
  terminal output). Then `bot deploy azure ...`.
- **Existing Entra/Teams app**: omit `--create-teams-app` and provide
  `--teams-app-password-secret`, `--teams-app-id`, `--teams-tenant-id`. The
  existing Key Vault must use Azure RBAC.
- **Inspection**: `kei bot status --installation ID` and
  `kei bot agents list --installation ID`.
- **Regional retry / teardown**: `kei bot destroy azure` prints a plan and
  requires typing the installation name or ID. `--preserve-installation` keeps
  the control-plane installation enabled for redeploy to another region; final
  teardown omits it. Destroy intentionally retains the customer Key Vault and
  secrets; Microsoft Entra app registrations are tenant-level and are also not
  removed.
- The CLI talks to the web app at `/api/cli/runtime-installations*`, which maps
  to `/api/v1/internal/runtime-installations*` on the ABAC engine.

### Flags beyond the usage string

`printUsage` is the compact surface; individual commands accept a few more
flags defined in `cmd/kei/{install,azure,azure_destroy,agents}.go`. Notable
ones:

- `bot install azure` also takes `--platform teams` (only `teams` is supported;
  the flag defaults to `teams`), plus `--runtime-secret-name`,
  `--teams-app-display-name`, `--app-name`, `--environment-name`,
  `--identity-name`, `--bot-name` for controlling generated Azure resource
  names.
- `bot deploy azure` also takes `--runtime-secret-name`, `--app-name`,
  `--environment-name`, `--identity-name`, `--bot-name`.
- `bot destroy azure` has `--confirm-destroy ID` for non-interactive teardown;
  it must exactly equal `--installation`.
- `bot agents add|remove` takes `--default` (make this the default agent).

### Platforms

`--platform cli|teams|discord|slack`. Platform-neutral headless runtime uses
`cli` (or omit `--platform`); that does not enable a chat-platform deployment
path. Azure installation remains Teams-only today. Discord, Slack, AWS, GCP,
and Terraform/Helm remain future options.

## Install

The `kei` CLI is a Go binary built from source in the kei repo — there is no
published package. Build it and put the binary on your PATH as `kei`:

```bash
cd cmd/kei && go build -o tmp/kei .
# then install tmp/kei somewhere on your PATH (the repo README suggests this)
```

Dependencies resolve through the Go module proxy; no internal package registry
is needed (D-008).

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
# Build from source (kei repo):
cd cmd/kei && go build -o tmp/kei .

# Confirm the exact command surface (source of truth):
tmp/kei help                       # prints printUsage
tmp/kei login --help               # -api-url flag
tmp/kei bot --help                 # subcommands: init install agents deploy status destroy

# Confirm the auth flow against a deployment:
tmp/kei login --api-url https://app.haikeilabs.com
#   -> prints URL + verification code; approve as owner/admin in a browser
#   -> "Logged in to Kei for organization <org_id>."

# Confirm a runtime installation round-trips:
tmp/kei bot init --name "Test" --platform teams
tmp/kei bot status --installation INSTALLATION_ID
tmp/kei bot agents list --installation INSTALLATION_ID
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
  public installation metadata only; runtime credentials are delivered by
  `bot deploy` to the customer secret manager, never to terminal output.
- Discord, Slack, AWS, GCP, and Terraform/Helm are **not** implemented; Azure +
  Teams is the MVP.
