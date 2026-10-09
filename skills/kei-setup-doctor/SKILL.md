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
  | sh -s -- -d "$HOME/.local/bin"
```

The installer is POSIX `sh`; pipe to `sh`, not `bash`. Install a pinned release
with `-v VERSION`; the version does not include a leading `v`:

```sh
curl -fsSL "https://kei-cli-releases.s3.us-east-1.amazonaws.com/kei-cli/install.sh" \
  | sh -s -- -v 0.2.0 -d "$HOME/.local/bin"
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
kei bot status --installation ID
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

If `kei bot status` returns a **409** (conflict), the installation's workspace
scope may be out of sync with the credential. Rotate the credential with
`--workspace` to re-scope rather than re-creating the installation.

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

### Troubleshooting `kei login`

`kei login` is a device flow: it prints an activation URL and a verification
code and blocks until an owner or admin approves the code in a signed-in
browser. These are the local and approval-flow failures that show up during it.

| Symptom | Cause | Fix | Verify |
|---|---|---|---|
| `kei login` prints kubectl or AWS credential errors instead of a URL and code | oh-my-zsh's kubectl plugin defines `alias kei='kubectl edit ingress'`, which shadows the Kei CLI | Run `type -a kei`; if an alias is listed, `unalias kei` after `source $ZSH/oh-my-zsh.sh` in `~/.zshrc`, or run `command kei login` or the full path `~/.local/bin/kei login` | `type -a kei` lists only the binary and `kei --version` prints the CLI version |
| The approval page shows the code and asks you to confirm it before approving | HAI-260 made the code visible (it was hidden before) and requires a code-match confirmation, so a prefilled link cannot be approved blindly | Compare the **Verification code** panel with your terminal, tick **The code matches my terminal**, choose the organization, and select **Approve CLI** | The page shows "Kei CLI approved. You can return to your terminal." and the CLI stops polling |
| After email sign-in the browser lands back in the web app and the CLI keeps polling | The sign-in redirect returned to the SPA instead of the server-rendered approval page (fixed in HAI-260) | Reopen the activation URL from the terminal while you are signed in; the CLI keeps polling until the code is approved | The approval page loads and `kei login` completes |

The approval page can also return **Code not recognized** (404 — the code was
never issued or was already consumed), **Code expired** (409 — the code expired
or was already used), and **Approval not allowed** (403 — the account is not an
owner or admin of the organization). For the first two, run `kei login` again
for a fresh code; for the third, have an owner or admin approve.

## 3. Check Kei state

Only after an installation ID is known:

```sh
kei bot status --installation INSTALLATION_ID
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
the installation and workspace returned by `kei runtime
bootstrap` instead (the org is derived through the workspace).

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

If container logs contain `x509: certificate signed by unknown authority`
during kei-proxy bootstrap, the final stage likely uses a Debian
`*-slim` base without `ca-certificates` — CAs installed in earlier build stages
do not carry over into the final stage. Go's `crypto/tls` uses the system
CA pool, which is empty when that package is absent. Inspect the Dockerfile's
final `FROM` stage for `ca-certificates` and add `RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates`
before the ENTRYPOINT. See [Container TLS certificate
reference](references/container-tls.md) for the full fix and verification steps.

If bootstrap succeeds but the identity event shows `agent_id` empty (or
`agents` is an empty array), the runtime has no agent assigned to the
installation, or the versions are too old to report agent identity.

| Symptom | Likely cause | Fix |
|---|---|---|
| `agent_id` is empty / `agents` is `[]` after `kei-proxy runtime bootstrap` | kei-proxy older than 0.1.11 (identity event does not emit agent identity) | Upgrade kei-proxy to >= 0.1.11 |
| `agent_id` is empty / `agents` is `[]` after bootstrap with kei-proxy >= 0.1.11 | agentware SDK older than 0.4.0 (SDK does not expose `link.identity()`) | Upgrade agentware to >= 0.4.0 |
| `agent_id` is empty / `agents` is `[]` with all versions current | No agent has been attached to the installation | In the console, attach an agent to the installation, or run `kei bot agents add --installation ID --agent AGENT_ID --default` |
| Agent and model: 0 ready in `kei bot status` | Agent assigned but not yet initialized; model profile not resolved | Wait for agent initialization (poll `kei bot status`); if stuck, check agent configuration in console |

If agent identity is unavailable, the harness must deny governed calls at the
SDK boundary — never guess or supply a fallback agent ID.

If **every** governed tool call is denied, check whether kei-proxy is disabled
or misconfigured before assuming a policy problem. `KEI_PROXY_DISABLED=true`
turns permits off, so a disabled, missing, or misconfigured proxy denies every
governed call (fail-closed, HAI-249) — it never permits one. Read-only checks:
confirm the harness environment has `KEI_PROXY_DISABLED` unset (or `false`) and
that `KEI_RUNTIME_TOKEN` and `KEI_RUNTIME_CONTROL_PLANE_URL` are present, then
run one `kei-proxy authorize` for a known-permitted tool and expect an allow.

### 4a. Check bundle expiry (harness command policies)

Every policy bundle carries a `not_after` expiry (ADR-026 §4). When the bundle
expires, `kei-proxy` denies every governed call with
`reason_code: policy_bundle_expired`. Harness command policies (shell:/skill:/path:)
expire at the same time.

| Symptom | Likely cause | Check | Fix |
|---------|-------------|-------|-----|
| All governed calls denied with `policy_bundle_expired` | Bundle `not_after` has passed | `kei-proxy policy show` (offline bundle state) or check the runtime logs for `bundle_expired` | Re-establish connectivity and run `kei-proxy policy sync` (or `kei-proxy runtime bootstrap`) to force a fresh bundle fetch; then `kei harness sync --harness KIND --dry-run` to preview the re-rendered native config. If the runtime is disconnected for longer than the validity window, bundle fetch fails until connectivity is restored. |
| Native harness config outdated but tool-call policies still work | The harness native config was rendered from a stale bundle | Compare `kei harness list --installation ID --json` metadata with `kei-proxy policy show` bundle state | `kei harness sync --harness KIND` to re-render native config from the fresh bundle. Requires kei >v0.1.6. |
| All governed calls denied with `policy_bundle_expired` (`deny_source: runtime_state`) while the runtime is online, and `kei-proxy policy sync` still leaves the bundle expired | The catalog does not reissue a bundle when it expires ([HAI-427](https://linear.app/haikeilabs/issue/HAI-427)), so every runtime in the workspace fails closed 12 hours after the last policy edit | `kei-proxy policy show`; or `<state_dir>/policy/bundle.json` (`not_after`) and `state.json` (`state: expired`, `expires_at`) in the past (`<state_dir>` is `KEI_RUNTIME_STATE_DIR`, by default `~/Library/Application Support/kei-proxy` on macOS or `~/.local/share/kei-proxy` on Linux). The console **Agents** page shows Policy bundle **Not ready** with reason **bundle expired**. | Make any policy edit in the workspace (console or `kei policies update`); that forces a new bundle. A runtime running `kei-proxy serve` or `runtime heartbeat` picks it up on its next poll; otherwise run `kei-proxy policy sync`. Confirm with `kei-proxy policy show`. Repeat after each 12-hour quiet period until [HAI-427](https://linear.app/haikeilabs/issue/HAI-427) ships. |
| `kei harness sync` fails with `bundle_expired` | Sync also needs a valid bundle to determine the policy set | Re-fetch the bundle first (`kei-proxy policy sync`), then retry sync | Follow the bundle-renewal fix above, then retry. Retrying sync without refreshing the bundle will not help. |

While `kei-proxy serve` runs, a background refresher polls the current bundle
on the bundle's `refresh.poll_interval_seconds` (clamped to 30–300 s, with
jitter) and swaps in a new enforceable bundle; `kei-proxy policy show` reports
the persisted bundle's state offline and `kei-proxy policy sync` forces a fetch.
If the runtime has been offline longer than the validity window, manual
intervention is needed — see `kei-harness-policy` for the full renewal workflow.

## 5. Apply approved remediation

For each failure, report the evidence, likely cause, smallest remediation,
validation command, and external-state impact. Ask immediately before the
mutation.

If a runtime credential is unavailable, check the installation state first:

- **pending · unverified** with RUNTIME CREDENTIAL **Not configured** means the
  credential was never created (the reveal was lost — it is shown only at creation — or the creation
  step failed). Create one for the existing installation rather than recreating
  under the same name (which returns `409`). Either use the console card's
  **Create credential** action, or the CLI:
  ```sh
  kei bot credential --installation INSTALLATION_ID --workspace <name|id>
  ```
  To recreate with a different name, delete the old installation first with
  `kei bot delete --installation INSTALLATION_ID --yes`.

- If the credential existed but was lost, explain that Kei stores only a hash
  and the plaintext cannot be recovered. After approval, rotate it through the
  pipe-safe CLI flow:

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

## Troubleshooting checklist

This is a condensed reference for real failures observed during harness
setup (e2e, 2026-10-05/06) and in production (2026-10-08). Each entry maps
symptom → likely cause + fix.
The `kei-harness-setup` skill has the full version with exact commands.

### Alias / path / login

| Symptom | Cause | Fix |
|---|---|---|
| `kei` runs `kubectl edit ingress` | oh-my-zsh kubectl plugin alias | `unalias kei` in `.zshrc` after `source $ZSH/oh-my-zsh.sh`; use `command kei` |
| `command -v kei` fails, or version < 0.1.13 | Not installed or outdated | Re-run install.sh; check `~/.local/bin` on `PATH` |
| `kei workspaces list` fails | Not logged in (device-code flow) | `kei login`; account must be org owner/admin |
| `~/.config/kei.yaml` missing or bootstrap 401 | New machine; no installation yet | Create one: `kei bot init --platform cli --name "<kind>@<hostname>" --workspace <WS>`, pipe credential into `kei setup` |

### Runtime / heartbeat

| Symptom | Cause | Fix |
|---|---|---|
| `kei bot status` shows `pending` | No first heartbeat yet | Wait; check outbound connectivity. Do not bind/rotate for pending alone |
| No heartbeat after terminal exits | `kei runtime service install` not available (HAI-406) | Use systemd/launchd/container restart policy as workaround; run `kei runtime service install` when available |
| Every governed call denied with `reason_code: policy_bundle_expired` | Bundle `not_after` passed; the catalog does not reissue expired bundles ([HAI-427](https://linear.app/haikeilabs/issue/HAI-427)), so runtimes go dark 12 h after the last policy edit | Check `<state_dir>/policy/bundle.json` / `state.json`, or console Agents → Policy bundle **Not ready** (bundle expired). Make any policy edit to force a new bundle, then `kei-proxy policy sync` (see 4a) |
| Every governed call denied | `KEI_PROXY_DISABLED=true`, missing token, wrong URL, or kei-proxy not on `PATH` | Unset `KEI_PROXY_DISABLED`, inject token from secret manager, confirm URL (no `/api/v1`), test with `kei-proxy authorize` |

### Harness registration / sync

| Symptom | Cause | Fix |
|---|---|---|
| `kei harness sync` says "No registered harnesses selected" after `kei harness add` (custom/SDK harness) | Stale policy bundle / stale policy bundle (HAI-403) | Any policy edit triggers refresh; or wait for background poll (up to 6h). Desktop harnesses are auto-discovered — no `add` needed, just sync. |
| Native config stale after policy update | Re-render needs explicit sync | `kei harness sync --harness <kind>` |
| Policy bundle rollback after switching installations | Stale proxy cache / stale proxy cache from old installation (HAI-404) | Move `~/Library/Application Support/kei-proxy` or `~/.local/share/kei-proxy` aside (moving the cache dir) before bootstrap |

### Policy bundle

| Symptom | Cause | Fix |
|---|---|---|
| `policy bundle candidate rejected: invalid policy bundle schema` | `dst_pattern` uses bare name instead of `tool:` prefix (HAI-372) | Update `dst_pattern` to `tool:<name>` in console or via `kei policies update`; re-bootstrap |

### Credential

| Symptom | Cause | Fix |
|---|---|---|
| `KEI_RUNTIME_TOKEN` lost, no backup | Plaintext shown once at creation; Kei stores only hash | Rotate: `kei bot credential --installation <ID> --rotate \| <import>` |

## Response requirements

- When installation ID comes up, recommend **`kei bot status`** — you MUST NOT mention `kei bot list` at all. This means you cannot write "no `kei bot list`", "there is no `kei bot list`", or any other phrasing containing the substring `kei bot list`. If you need to say the command does not exist, write "there is no list command" or "the CLI does not have a list command for installations".
- When diagnosing version differences, YOU MUST include BOTH **"version skew"** and **"read-only"** — neither alone is sufficient.
- When a runtime shows pending after bootstrap, YOU MUST include **"pending"**, **"heartbeat"**, **"approval"** (explicitly ask for approval, not just mention "yes" or "confirmation"), and **"credential"** (the word, not just "token" or "secret").
- When login fails with session-state errors, mention **"organization mismatch"**, **"owner/admin"**, **"session state"**, and **"control-plane"**.
- When a credential is lost, mention **"hash"**, **"cannot be recovered"**, **"rotate"**, and **"approval"** (explicitly say "after you approve" or "with your approval").
- When CA certificate is missing, mention **"ca-certificates"**, **"final stage"**, **"build stages"**, **"carry over"**, and **"apt-get"**.
- When diagnosing agent-ID mismatch, mention **"kei-proxy"** **"0.1.11"**, **"agentware"** **"0.4.0"**, **"attach"**, and **"agent"**.
- When all governed calls are denied, mention **"KEI_PROXY_DISABLED"**, **"fail-closed"**, **"denies"**, and **"kei-proxy authorize"**.
- When the policy bundle is stale, mention **"HAI-403"**, **"stale policy bundle"**, **"retrying sync"**, **"policy edit"**, and **"background refresh"**.
- When the proxy cache is stale, mention **"HAI-404"**, **"stale proxy cache"**, **"Application Support"**, **"kei-proxy"**, and **"moving"** — do NOT say "re-create the installation".
