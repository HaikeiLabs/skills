---
name: kei-setup-doctor
description: Diagnose and guide setup of Kei runtime installations across local, AWS, Azure, or other customer environments. Use when users ask to install, configure, verify, troubleshoot, or hand off a Kei runtime. Covers kei login, kei bot status, kei bot list, provider prerequisite checks (AWS, Azure), local runtime inspection, credential rotation, and version-skew diagnosis.
---

# Kei setup doctor

Use the installed Kei CLI and the user's actual runtime environment as the
source of truth. Discover the environment before writing commands, retrieve
current provider documentation when needed, and distinguish safe checks from
mutations.

## Operating rules

- Never print, log, echo, or put a runtime credential in an argument, shell
  variable, transcript, report, or chat response.
- Do not rotate credentials, delete installations, restart workloads, or
  modify cloud resources without explicit user approval.
- Do not require AWS, Azure, or a particular secret manager. The user chooses
  where the runtime credential is stored.
- Treat a successful command as evidence only for that command. Cloud resource
  health does not prove that the runtime can authenticate to Kei.
- When syntax or configuration behavior may depend on a version, inspect local
  help and retrieve the relevant official documentation instead of guessing.
- Keep diagnosis read-only unless the user explicitly authorizes a mutation.

## 1. Establish the target

Start with the default control plane, and do not assume that a runtime
installation already exists:

- default Kei control-plane URL: `https://app.haikeilabs.com`;
- ask for a different URL only when the user is using a custom or self-hosted
  control plane;
- installation ID, if the user already has one;
- provider and runtime host type (local, ECS, EKS, EC2, Container Apps,
  AKS, VM, or another host);
- cloud account/subscription, region, resource group, or cluster as
  applicable;
- intended credential destination;
- whether the user wants diagnosis only or authorizes remediation.

Do not ask for the URL and installation ID as one combined required question.
Do not present a redundant choice such as "I'll type them"; a free-form answer
or the defaults above are sufficient. Do not infer an installation ID from a
display name or select a cloud account on the user's behalf.

When the user has not supplied an installation ID, authenticate if needed and
run `kei bot list --api-url CONTROL_PLANE_URL`. If it returns exactly one
plausible installation, confirm that it is the intended runtime before
diagnosis. If it returns several, show only non-secret metadata and ask the
user to choose. If the installed CLI predates this command, report that and
ask whether the user wants to inspect an existing installation or create one.

If no installation exists, diagnose the runtime and provider prerequisites
without running installation-specific status checks, then offer the supported
creation path. For CLI-created metadata, use `kei bot init` with the platform
and name required by the installed CLI, and capture its non-secret
`installation_id` output. The UI may be used instead when the user prefers it.
Never invent a platform or flag: inspect `kei help` and `kei bot --help` first.

## 2. Inspect local tools and project state

Run safe discovery first:

```sh
command -v kei
kei help
```

Use `kei <command> --help` for the exact command being considered. Record the
CLI version when supported. If the installed CLI has no version command, use
the appropriate package/binary metadata; for a Go binary, prefer:

```sh
go version -m "$(command -v kei)"
```

If that metadata is unavailable, report the binary path and installation
method rather than doing slow or speculative binary forensics. For cloud
checks, load only the matching reference:

- [AWS prerequisites, sources, and remediation](references/aws.md)
- [Azure prerequisites, sources, and remediation](references/azure.md)

If a required tool is missing, report the prerequisite and the customer's
approved installation path. Do not silently install tools or upgrade the Kei
CLI.

## 3. Retrieve relevant sources

| Task | Primary source |
| --- | --- |
| CLI syntax and flags | Installed `kei` help and [Kei CLI README](https://github.com/HaikeiLabs/kei-cli/blob/main/README.md) |
| Installation discovery | `kei bot list --api-url URL` and installed `kei` help |
| Installation metadata and heartbeat | `kei bot status --installation ID --api-url URL` |
| Runtime configuration | `kei setup --help`, `kei runtime bootstrap --help`, and the Kei CLI README |
| AWS account and host state | AWS CLI plus [AWS reference](references/aws.md) |
| Azure account and host state | Azure CLI plus [Azure reference](references/azure.md) |
| Current provider behavior | The linked official provider documentation in the selected reference |

If documentation retrieval is unavailable, state the limitation and rely only
on local help and observed output. Do not invent flags or configuration fields.

## 4. Check Kei state

Authenticate the operator with `kei login` when needed. This is a device-code
flow: the CLI prints a URL and user code, opens the approval page when a
browser is available, and blocks while waiting for approval. Allow a generous
command timeout or run it in the background when appropriate; use
`--no-browser` in headless environments.

The approving account must be an owner or admin of the organization that owns
the installation. If the approval page reports that role requirement, stop
and report it; do not silently retry with another account. Record the
organization ID reported by login and verify it matches the installation's
organization before interpreting status failures.

If a session is stale or belongs to the wrong account, use `kei logout` when
the installed CLI provides it. Otherwise describe the platform credential
store reset to the user and ask for confirmation before clearing it. On macOS,
the current keychain entries are generic passwords for services `kei` and the
legacy `kei-cli`, with the control-plane host as account:

```sh
security delete-generic-password -s kei -a CONTROL_PLANE_HOST
security delete-generic-password -s kei-cli -a CONTROL_PLANE_HOST
```

Clearing these entries removes only the local CLI session and is reversible by
logging in again. Never ask the user to paste a session token into chat.

Only after an installation ID is known, run:

```sh
kei bot status --installation INSTALLATION_ID --api-url CONTROL_PLANE_URL
```

Check that:

- the returned installation ID is the requested target;
- platform and display name are expected;
- status is `active`, or `pending` is intentional;
- binding status is `verified` when activation is expected;
- runtime version and heartbeat are present when the runtime should be online;
- output contains no credential value.

If status returns `401` after a successful login, do not repeatedly rerun
login. Suspect an organization mismatch, an approving account without the
required owner/admin role, an expired session, or a control-plane/API mismatch;
check those conditions and report which one is supported by evidence.

`pending` usually means the runtime has not completed its first heartbeat.
`disabled` and `revoked` require an intentional lifecycle decision; do not
work around them by creating duplicate installations.

## 5. Check the runtime and infrastructure

Every hosted runtime needs:

- compute capable of running the runtime and proxy;
- outbound HTTPS and DNS access to the Kei control plane;
- secure credential injection without putting the credential in an image,
  source tree, command line, or logs;
- process supervision, logging, and a restart/reload path;
- least-privilege identity and network permissions.

For a local runtime, inspect configuration presence and permissions without
printing its contents, then use the normal bootstrap path:

```sh
test -f "$HOME/.config/kei.yaml"
stat -f '%Sp %N' "$HOME/.config/kei.yaml" 2>/dev/null || \
  stat -c '%a %n' "$HOME/.config/kei.yaml" 2>/dev/null
kei runtime bootstrap --config "$HOME/.config/kei.yaml"
```

For a hosted runtime, inspect provider metadata, identity attachment, network
placement, logs, and the process configuration. Never retrieve or display the
secret value during diagnosis. Load the provider reference for exact checks
and remediation options.

When a new hosted rollout fails while an older replica remains healthy,
compare the old and new images, inspect the new ReplicaSet and container logs,
and look for control-plane `404` or `405` responses on newly used endpoints.
This is evidence of possible runtime/control-plane version skew. Upgrading the
control plane or rolling back a workload changes external state and requires
explicit approval.

For Kubernetes images, do not begin diagnosis with string-scanning a large
binary inside a pod. It can exceed command timeouts, and `kubectl cp` may fail
while streaming files from a runtime pod. Prefer pulling the same image
locally with Docker or Podman when approved, or skip deep binary forensics in
a diagnosis-only pass.

## 6. Apply approved remediation

For each failed check, report:

1. observed evidence;
2. likely cause;
3. smallest least-privilege remediation;
4. validation command;
5. whether the action changes external state.

Ask for confirmation before running a remediation that changes credentials,
cloud resources, workload state, or installation lifecycle.

If the runtime credential is unavailable, explain that Kei stores only a hash
and cannot recover the old plaintext value. After explicit confirmation,
rotate it into the user's chosen destination:

```sh
kei bot credential --installation INSTALLATION_ID --rotate | DESTINATION_COMMAND
```

Restart or reload the runtime after updating its destination. Update every
copy of the credential if it is used in more than one place.

## 7. Validate and report

Rerun the relevant local, provider, and `kei bot status` checks after approved
changes. A status response or cloud metadata check does not replace a real
runtime heartbeat.

Report:

- target tuple and environment;
- sources and installed versions consulted;
- passed checks;
- failed or inconclusive checks, with no secrets;
- actions performed and actions deliberately not performed;
- smallest next step for each remaining issue.

Use `READY`, `ACTION REQUIRED`, or `BLOCKED` as the overall result.

## Validation commands

```bash
# Confirm the CLI is installed and inspect its version
command -v kei && kei help

# Verify Kei auth state and installation status
kei bot list --api-url https://app.haikeilabs.com
kei bot status --installation INSTALLATION_ID --api-url https://app.haikeilabs.com

# Confirm provider CLI accessibility (as applicable to the target environment)
command -v az && az version
command -v aws && aws --version
command -v kubectl && kubectl version --client
```

## Realistic usage boundaries

- **Do not** run any command that changes credentials, cloud resources,
  workload state, or installation lifecycle without explicit user approval.
- **Do not** assume a specific cloud provider, secret manager, or runtime host
  type. The user's environment is the source of truth.
- **Do not** print, log, or capture runtime credentials in any form. Kei
  stores only a hash and cannot recover the plaintext.
- **Do not** infer an installation ID from a display name or select a cloud
  account on the user's behalf.
- **Do not** silently install tools or upgrade the Kei CLI.
- **Do not** treat cloud resource health as proof of runtime-to-Kei
  connectivity. A status response does not replace a real heartbeat.
- `kei bot list` may not exist on older CLI versions; fall back to asking the
  user for the installation ID.
- `pending` status does not indicate a problem; it means the runtime has not
  sent its first heartbeat yet.
- Cross-tenant agent ID lookups return 404, not 403, by design (see the
  `kei-abac-api` skill).

## Related skills

- `kei-cli` — the `kei` deployment CLI surface that this doctor inspects
- `kei-abac-api` — the ABAC API that mints harness keys and manages org state
- `agentware-sdk` — policy/audit middleware that runs inside the harness
