---
name: kei-setup-doctor
description: Diagnose and guide Kei runtime installations across local, AWS, Azure, or other customer environments. Use for Kei installation, configuration, verification, troubleshooting, or handoff.
---

# Kei setup doctor

Use the installed Kei CLI and the customer's runtime environment as the
source of truth. Discover before acting, load only the provider reference that
matches the environment, and separate diagnosis from remediation.

**This skill is a workflow, not a CLI command.** There is no `kei setup doctor`
subcommand and this skill must never advertise one. It diagnoses installations
by driving the commands the `kei-cli` repository actually implements — `kei
setup`, `kei runtime bootstrap`, `kei login`/`logout`, and the `kei bot`
subcommands — plus ordinary read-only cloud and host tooling. Confirm the real
surface of the installed binary before relying on any syntax:

```sh
kei --help
kei setup --help
kei runtime bootstrap --help
```

## Guardrails

- Keep diagnosis read-only. Ask before rotating credentials, deleting an
  installation, restarting a workload, changing cloud resources, or changing
  an account/subscription context.
- A blanket "just do it" given before diagnosis is not approval for a specific
  change. Diagnose first. Then name each mutation, what it changes, and what it
  breaks (rotation kills the current token immediately; a restart drops
  in-flight work), and get a yes for that step before running it or handing
  over its command. Until then, give only the read-only commands.
- Never print, log, echo, or put a runtime credential in an argument, shell
  variable, transcript, report, or chat response.
- Do not assume AWS, Azure, a secret manager, a runtime host, or an existing
  installation. The customer chooses the credential destination.
- Treat each command as evidence only for what it checked. Cloud health does
  not prove runtime authentication or a Kei heartbeat.
- Inspect local help and current provider documentation when behavior depends
  on a version; do not invent flags or configuration fields.

## Install or upgrade the published CLI

For supported macOS and Linux systems (arm64 and amd64), install the published
`kei` binary from the public release endpoint. The installer selects the local
platform, downloads the archive, and verifies its SHA-256 checksum before
installing it. Use a user-writable directory unless system-wide installation
is explicitly wanted:

```sh
export PATH="$HOME/.local/bin:$PATH"
curl -fsSL "https://kei-cli-releases.s3.us-east-1.amazonaws.com/kei-cli/install.sh" \
  | bash -s -- -d "$HOME/.local/bin"
```

Install a pinned release with `-v VERSION`; the version does not include a
leading `v`:

```sh
curl -fsSL "https://kei-cli-releases.s3.us-east-1.amazonaws.com/kei-cli/install.sh" \
  | bash -s -- -v 0.2.0 -d "$HOME/.local/bin"
```

Rerun the installer to upgrade. Verify the command after installation:

```sh
command -v kei
kei help
```

Do not put runtime credentials in the installer command or environment. The
release endpoint is public and the installer only downloads and verifies the
CLI binary.

## 1. Establish the target

Use `https://app.haikeilabs.com` as the control-plane default. Ask for a
different URL only for a custom or self-hosted control plane. The installation
ID is optional at this stage.

There is **no `kei bot list`** command — the CLI cannot enumerate installations.
If no ID was supplied, ask the customer for it, or have them read it from the
control-plane UI or the Kei API (`kei-api` owns installation listing).
Once you have a candidate ID, confirm it from its non-secret metadata:

```sh
kei bot status --installation ID --api-url CONTROL_PLANE_URL
```

If that ID is wrong or unknown, ask the customer to choose rather than guessing
or probing IDs. If no installation exists, check prerequisites first, then use
the supported UI or:

```sh
kei bot init --platform PLATFORM --name NAME
```

Capture the returned `installation_id`; it is not secret. Inspect
`kei help` and `kei bot --help` before relying on version-specific syntax. The
implemented `bot` subcommands are `init`, `agents`, `status`, `delete`,
`credential`, and `bind`; there is no `install`, `deploy`, `destroy`, or `list`.

Collect the remaining target details:

- local or hosted runtime and host type (ECS, EKS, EC2, Container Apps, AKS,
  VM, or another host);
- confirmed cloud account/subscription, region, resource group, or cluster;
- intended credential destination;
- diagnosis-only or explicitly approved remediation.

Do not combine the control-plane URL and installation ID into one required
question, infer an ID from a display name, or select a cloud account for the
customer.

## 2. Inspect tools and authenticate

Start with cheap local discovery:

```sh
command -v kei
kei help
kei --version
```

If the installed CLI has no version command, identify a Go binary with:

```sh
go version -m "$(command -v kei)"
```

Use `kei <command> --help` for exact flags. Load only the matching reference:

- [AWS runtime checks and EKS diagnostics](references/aws.md)
- [Azure runtime checks](references/azure.md)

Run `kei login` when needed. It is a device-code flow: it prints a URL and
user code, may open a browser, and blocks while waiting for approval. Allow a
long timeout or run it in the background; use `--no-browser` headlessly. The
approving account must be an owner or admin of the organization that owns the
installation. Record the organization ID reported by login and compare it
with the installation's organization.

Use `kei logout` to clear a stale or wrong local session. If that command is
unavailable, explain the OS credential-store reset and ask before clearing it;
do not ask for a session token.

## 3. Check Kei state

Only after an installation ID is known:

```sh
kei bot status --installation INSTALLATION_ID --api-url CONTROL_PLANE_URL
```

Verify the ID, platform, display name, status, binding status, runtime
version, and heartbeat. `pending` commonly means the runtime has not sent its
first heartbeat; `disabled` and `revoked` require an intentional lifecycle
decision.

If status returns `401` after a successful login, do not repeatedly retry
login. Check organization mismatch, owner/admin role, session state, and
control-plane/API compatibility, then report the evidence-supported cause.

## 4. Check the runtime

Every hosted runtime needs compute, outbound HTTPS/DNS to the control plane,
secure credential injection, process supervision, logs, restart/reload
behavior, and least-privilege identity/network access.

For the supported co-located deployment, verify that the harness and its
`kei-proxy` child process share these environment values:

```text
KEI_RUNTIME_CONTROL_PLANE_URL=https://app.haikeilabs.com
KEI_RUNTIME_TOKEN=<injected-secret>
KEI_RUNTIME_VERSION=<deployed-version>
```

The URL is the gateway base; do not add `/api/v1`. Check that the token is
injected through the container/service secret mechanism and is not present in
argv, logs, or shell history. Do not diagnose scope from `KEI_ORG_ID`; verify
the installation, organization, and workspace returned by `kei runtime
bootstrap` instead.

For local runtimes, check configuration presence and permissions without
printing contents:

```sh
test -f "$HOME/.config/kei.yaml"
stat -f '%Sp %N' "$HOME/.config/kei.yaml" 2>/dev/null || \
  stat -c '%a %n' "$HOME/.config/kei.yaml" 2>/dev/null
kei runtime bootstrap --config "$HOME/.config/kei.yaml"
```

For hosted runtimes, inspect provider metadata, identity, network placement,
workload configuration, and logs. Read the provider reference for exact
commands. If a new replica crashes while an older one is healthy, compare
images and logs; control-plane `404`/`405` responses on new endpoints suggest
runtime/control-plane version skew. Deep string-scanning of large pod
binaries is slow and `kubectl cp` may fail; prefer inspecting the same image
locally or skip binary forensics during a read-only pass.

## 5. Apply approved remediation

For each failure, report the evidence, likely cause, smallest remediation,
validation command, and external-state impact. Ask immediately before the
mutation.

If a runtime credential is unavailable, explain that Kei stores only a hash
and cannot recover the old plaintext. After approval, create or rotate it
through the pipe-safe CLI flow:

```sh
kei bot credential --installation INSTALLATION_ID --rotate | DESTINATION_COMMAND
```

Update every destination that uses the credential, then restart or reload the
runtime as approved. For version skew, upgrading the control plane or running
`kubectl rollout undo` is a mutation and requires approval.

## 6. Validate and report

Rerun the relevant checks after approved changes. A status response or cloud
metadata check does not replace a real runtime heartbeat.

Report the target, CLI/provider versions and sources consulted, passed checks,
failed or inconclusive checks, actions performed, actions not performed, and
the smallest next step. Use `READY`, `ACTION REQUIRED`, or `BLOCKED`.
