---
name: kei-harness-setup
description: "Connect a coding-agent harness — Claude Code, Codex, OpenCode, Pi, or Cursor — to Kei governance. Install the Haikei skills into the right skills directory, pair the harness with a runtime installation and kei-proxy, pass agent identity to each governed call, and prove that unbound calls are denied. Desktop harnesses use `kei harness sync` (auto-detected, no registration needed); custom/SDK harnesses use `kei harness add`. Use whenever someone wants to \"set up Kei in Claude Code/Codex/OpenCode/Pi/Cursor\", install or update the Haikei skills, onboard a harness or adapter, or asks which harnesses Kei supports. Also covers the product harnesses Assistant, PDE, and Discord at the routing level."
---

# Set up a harness with Kei

Kei governs a harness through this chain:

`harness adapter → kei-proxy (kei-connector-runtime) → kei-policy-catalog`

The harness asks `kei-proxy` before each governed operation. `kei-proxy`
decides locally against the workspace policy bundle and runs allowed work
inside the tenant runtime. The catalog holds policy, connector metadata, and
redacted audit metadata only. Setting up a harness means installing the skills
that teach the agent this contract, then wiring the harness to a runtime.

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

This is a workflow skill. Keep the two Kei executables straight: **`kei`** is
the platform admin CLI a person runs once to set things up (`kei-cli` skill);
**`kei-proxy`** is the runtime the harness calls on every governed tool call
(`kei-proxy` skill). The agent itself only ever talks to `kei-proxy`. Load
**`kei-runtime-setup`** for the runtime half of the setup.

### Per-harness setup scripts

This skill includes portable setup scripts in `scripts/` for each supported
coding-agent harness. Each script is self-contained POSIX `sh` (with a shared
`setup-lib.sh`) that checks prerequisites (including detecting an existing
`~/.config/kei.yaml` to decide whether a fresh runtime installation is
needed), creates a runtime installation if the machine does not have one,
syncs the harness (desktop kinds are auto-detected — no separate
registration needed), and runs `verify.sh` to confirm the setup is valid.
The shared `setup-lib.sh` calls `kei harness add` with `|| true` for
backward compatibility (the `add` may be rejected for desktop kinds that
sync auto-discovers; the `|| true` ensures the script does not halt), but
the primary registration path for desktop harnesses is `kei harness sync`.

**Installing from GitHub (clone + link):**

```sh
# 1. Clone the Haikei skills repo (once; git pull to update)
git clone https://github.com/HaikeiLabs/skills.git ~/src/haikei-skills

# 2. Link each skill into the harness's skills directory
#    (skip already-existing skills — never overwrite without asking)
SKILLS_DIR=~/.config/opencode/skills   # or the correct dir for your harness
mkdir -p "$SKILLS_DIR"
for d in ~/src/haikei-skills/skills/*/; do
  name=$(basename "$d")
  dest="$SKILLS_DIR/$name"
  if [ -e "$dest" ]; then echo "exists, skipping: $name"; continue; fi
  ln -s "$d" "$dest"
done

# 3. Verify the harness discovers the skills
opencode debug skill | jq -r '.[].name' | grep '^kei'
```

**Using the setup scripts (preferred for first-time setup):**

```sh
# The per-harness scripts handle everything: prerequisites check,
# installation creation, credential piping (never printed to terminal),
# harness sync (desktop kinds auto-detected), and verification.
bash skills/kei-harness-setup/scripts/setup-opencode.sh
```

| Script | Harness |
| --- | --- |
| `scripts/setup-claude-code.sh` | Claude Code |
| `scripts/setup-codex.sh` | Codex |
| `scripts/setup-opencode.sh` | OpenCode |
| `scripts/verify.sh <kind>` | All (run after any setup or as a standalone check) |

The scripts are safe to re-run (idempotent) and never print a runtime
credential to the terminal — tokens are piped directly from `kei bot
credential` into `kei setup`.

## Retrieval sources

| Source | How to retrieve | Use for |
| --- | --- | --- |
| Console: Agent setup | `https://app.haikeilabs.com/#/docs/agent-setup` | Supported harnesses, the harness → runtime → catalog flow, DENY rules |
| Console: Get started | `https://app.haikeilabs.com/#/docs/getting-started` | Per-harness skill install commands |
| Console: Agents page | **Agents →** a harness card → **Copy setup prompt** | The canonical per-harness setup prompt |
| Skills repo | `https://github.com/HaikeiLabs/skills#installing` | Current skill-directory table |
| The harness's own docs | Its skills documentation | Where that harness version discovers skills |

## Supported harnesses

| Harness | Kind | Notes |
| --- | --- | --- |
| Claude Code, Codex, OpenCode, Pi | Kei-enabled local coding harness | This skill's main path |
| Cursor | Kei-enabled local coding harness (skills only) | The skills repo ships a Cursor plugin; the console does not list a Cursor runtime adapter yet, so confirm before promising governed calls |
| Assistant, PDE | Kei product harness | Adapter is built into the product; register its tools against an installation |
| Discord | Haikei-internal product harness | Not a customer onboarding path |

Any other harness is unsupported and is denied until an adapter is explicitly
registered. Do not improvise one.

## FIRST: find out which harness you are running in

Check the environment rather than assuming — the skills directory differs per
harness, and installing into the wrong one silently does nothing. Then check
whether the skills are already there (for example a `kei-cli` folder in the
harness's skills directory, or the harness's skill list) before installing
again.

> **Installing skills changes what the agent knows, not what it may do.**
> Policy in the workspace decides that. Until a deny check passes (step 6),
> the agent can see the Haikei skills but cannot make governed tool calls.

## 1. Install the Haikei skills

The repo is `https://github.com/HaikeiLabs/skills`. Skills are portable
`SKILL.md` folders, so every harness gets the same content.

**Plugin install (preferred where available):**

```text
# Claude Code
/plugin marketplace add HaikeiLabs/skills
/plugin install haikei@haikei

# Codex
codex plugin marketplace add HaikeiLabs/skills
codex plugin add haikei@haikei
```

Cursor: **Settings → Rules → Add Rule → Remote Rule (GitHub)** with
`HaikeiLabs/skills`.

**Clone and link (OpenCode, Pi, or any harness without a plugin flow):**

```sh
git clone https://github.com/HaikeiLabs/skills.git ~/src/haikei-skills
for d in ~/src/haikei-skills/skills/*/; do
  name=$(basename "$d")
  dest="$SKILLS_DIR/$name"                 # pick SKILLS_DIR from the table below
  if [ -e "$dest" ]; then echo "exists, skipping: $name"; continue; fi
  ln -s "$d" "$dest"
done
```

Symlinks keep the skills current with `git pull`; copy instead if the harness
does not follow symlinks. Either way: keep existing skills, never overwrite a
same-named skill without asking, and never copy `.git`.

| Harness | User directory | Project directory |
| --- | --- | --- |
| Claude Code | `~/.claude/skills/` | `.claude/skills/` |
| Codex | `~/.agents/skills/` (older: `~/.codex/skills/`) | `.agents/skills/` |
| OpenCode | `~/.config/opencode/skills/` (or `$OPENCODE_CONFIG_DIR/skills/`) | `.opencode/skills/` |
| Pi | `~/.pi/agent/skills/` or `~/.agents/skills/` | `.pi/skills/` or `.agents/skills/` |
| Cursor | `~/.cursor/skills/` | — |

OpenCode also reads `~/.claude/skills/` and `~/.agents/skills/`, and Pi reads
`~/.agents/skills/`. So one copy in `~/.agents/skills/` serves Codex, OpenCode,
and Pi. Avoid installing the same skill name in two directories that one
harness reads, or it may load a stale copy.

**Verify discovery.** Each `SKILL.md` must start with `---` frontmatter holding
`name` and `description`; a file that begins with anything else (even a
comment) is skipped. Then confirm the harness actually sees the skills.
OpenCode can list them:

```sh
opencode debug skill | jq -r '.[].name' | grep '^kei'
```

For the other harnesses, restart the session and check the skill list. A new
skill is not picked up by a session that is already running.

## 2. Pair the harness with a runtime

Governed calls need a runtime installation and `kei-proxy` on the same host or
container as the harness. Follow **`kei-runtime-setup`** — it starts with
`kei login`, which a person must approve in the browser. For a local coding
harness, create the installation with `--platform cli`.

For a Kei-enabled coding harness on a workstation, the current path is:

```sh
kei login                                       # admin, once; a person approves in the browser
kei bot init --platform cli --name "my laptop"
kei workspaces list                               # discover workspace name or ID
kei bot credential --installation ID --workspace WS | <secret-manager import>
<secret-manager read> | kei setup --control-plane-url https://app.haikeilabs.com   # token via pipe → ~/.config/kei.yaml
kei runtime bootstrap     # runs the bundled kei-proxy to verify + heartbeat
kei bot bind --installation ID
```

At run time the harness process needs `KEI_RUNTIME_TOKEN` and
`KEI_RUNTIME_CONTROL_PLANE_URL` in its environment so the `kei-proxy` it
spawns for each call inherits them. Load them from the secret manager; do not
put the token in a harness config file in a repo.

## 3. Sync the harness (auto-discovery) or register a custom harness

> **Prerequisite:** `kei policies` and `kei harness` ship in kei >v0.1.6,
> unreleased as of 2026-10-01. Skip this step if the installed version predates
> it. Load **`kei-harness-policy`** for the full command reference.

### When to use `kei harness add`

`kei harness add` is **only for custom/SDK harnesses** (`--kind custom`).
Desktop coding harnesses (Claude Code, Codex, OpenCode, Pi) are **sessions**
of one runtime installation per machine. They are auto-discovered by
`kei harness sync` — you do NOT need to run `kei harness add` for them.

| Use case | Action |
|---|---|
| Desktop harness on a workstation | `kei harness sync` — no `add` needed |
| Custom/SDK harness you built | `kei harness add --kind custom [--installation ID] [--agent ID]` |

Flags: `--installation` defaults to the single installation on this machine;
`--agent` defaults to the default agent. Errors: `ALREADY_EXISTS` means the
agent already has a harness on that installation; `no default agent found`
means set a default agent with `kei bot agents add --default` or pass
`--agent`.

### Desktop harnesses: auto-discovered by sync

A harness is keyed by the **agent** (3NF): its identity is
`(installation_id, agent_id)`, and the console labels these harnesses "agents".
The agent must already be attached to the installation (`kei bot agents add`).

For desktop harnesses (`claude_code`, `codex`, `opencode`), you skip `add`
entirely — `sync` auto-discovers them:

```sh
kei harness sync --harness claude_code
```

`--kind` is `claude_code`, `codex`, `opencode`, or `custom`. Sync fetches
the policy bundle and renders the native config for that kind:

```sh
kei harness sync --harness claude_code
```

After sync, Kei can render the policy bundle into the harness's native config
format (e.g. `~/.claude/settings.json` → `permissions.allow`). The first render
happens on sync; subsequent policy changes re-render through the background
bundle refresh in `kei-proxy serve`.

**Back up the existing native config before the first sync** — `kei harness
sync` overwrites the harness's native config file for the matched kind.

## 4. Pass identity on every governed call

A tool call is **governed** when it touches tenant data, external systems, or
credentials: it goes through `kei-proxy authorize` (or the agentware
`KeiProxyEvaluator` — see the `agentware-sdk` skill), Kei policy decides, the
decision is audited, and enrollment or approval can apply. A call that is
**non-governed** runs locally and never reaches Kei. When unsure, treat the
tool as governed. The full distinction is in the `kei-proxy` skill.

The adapter calls `kei-proxy authorize` before a governed tool runs and obeys
the result: exit code `0` means allowed; any non-zero exit (a deny, or an
error such as an unreachable control plane) means do not run the tool. The
full flag and env reference is in the `kei-proxy` skill. Identity and
delegation come from flags or environment:

```text
KEI_PROXY_FRAMEWORK=claude|codex|opencode|pi   # which harness
# Agent identity is auto-discovered from the runtime identity event
# (kei-proxy >= 0.1.11, agentware >= 0.4.0). No agent-ID env var needed.
KEI_PROXY_INVOKING_SUBJECT=<the human who started the task>
KEI_PROXY_PARENT_SPAN / KEI_PROXY_DELEGATION_DEPTH   # when a subagent delegates
KEI_PROXY_REGISTRY=<tool → service registry path>
```

Keep the human who started the task as the invoking subject through every
subagent hop; it is what the audit trail attributes the call to. Never put a
tenant, org, or workspace ID in agent-controlled tool parameters — scope comes
from the runtime token. The `kei-proxy authorize` endpoint does not require a
`platform_tenant_id` (there is no tenant concept for now); a request without a
chat subject simply reaches the policy decision.

To read the assigned agent ID at runtime, use the agentware SDK's
`link.identity()` (see `agentware-sdk` skill). If identity is not available,
deny governed calls — never guess a fallback agent ID.

### 3a. Use KeiProxyEvaluator instead of hand-rolling authorize

If your harness imports the agentware SDK (any of the three ports), use
`KeiProxyEvaluator` instead of calling `kei-proxy authorize` directly. It
handles spawn, timeout, env filtering, decision parsing, enrollment
extraction, and all fail-closed invariants. See the `agentware-sdk` skill for
per-language construction, the decision table, and testing with shared
fixtures.

Do **not** keep a local allow list in the harness. The workspace policy bundle
(`kei-proxy` + `kei-policy-catalog`) is the single source of truth for what
is allowed. A local allow list is stale on deploy and invisible to audit.

> **Future (HAI-124):** Catalog-distributed policy bundles will let the
> control plane push policy updates to runtimes without a deploy. Until then,
> the runtime boots with the bundle it fetched at bootstrap. `KeiProxyEvaluator`
> works the same way either way — it asks `kei-proxy` every time.

## 5. Register tools and bind connectors (console)

Registering the harness's skills and tool IDs against the installation, and
binding connectors and capabilities to an agent, happen in the web app today
(**Agents → Bindings**). There is no `kei` command for them and no
resource-oriented API yet. A tool is not allowed just because the adapter
exposes it; baseline tools like `search_wiki` and `web_search` are
policy-governed too.

## 6. Prove it fails closed

Run one permitted, disposable call and one deliberately **unbound** call.
An unbound call has no agent binding, no matching policy, or references a tool
not registered for this installation — it must be denied:

```sh
# Permitted call (agent is bound, tool is registered)
kei-proxy authorize --user TEST_USER_ID --tool github.create_pr \
  --action github:write --resource repo:acme/widgets; echo "exit=$?"

# Unbound call — no agent binding, no registration, must be DENY
kei-proxy authorize --user UNBOUND_USER --tool nonexistent.tool \
  --action unknown:action --resource unknown:resource; echo "exit=$?"
```

The unbound call must be denied without any provider call and produce only
redacted audit metadata. Exit code `0` is ALLOW; any non-zero exit is DENY
(or an error). Missing bindings, an unregistered harness, invalid installation
scope, stale policy, and no matching policy must all be **DENY**. The harness
is not set up until you have seen a denial — until then the agent can see the
Haikei skills but has not proven that governed calls actually go through Kei.

If you configured harness command policies (step 3), also verify the native
config was rendered correctly:

```sh
# Claude Code — check permissions.allow contains expected entries
cat ~/.claude/settings.json | jq '.permissions.allow'

# OpenCode — check permission.bash
cat opencode.json | jq '.permission.bash'
```

Run a command that should be permitted and one that should be denied:

```sh
# Should be allowed (if shell:git is in your policies)
git status

# Should be denied (if shell:* deny is in your policies)
curl example.com
```

`KEI_PROXY_DISABLED=true` is a valid setting, but it turns permits off: a
disabled, missing, or misconfigured kei-proxy denies **every** governed call
(fail-closed, HAI-249) — it never permits a tool call. Tests that need an allow
inject a fake evaluator instead (see the `agentware-sdk` skill); a production
harness should not run with kei-proxy disabled.

## 7. Enrolling chat users (claim links)

When a chat-platform user (Teams, Slack, or Discord) is not yet linked to a
Kei user, the authorize endpoint returns `decision: "enrollment_required"`
with an `enrollment` block instead of `deny`:

```json
{
  "decision": "enrollment_required",
  "reason": "provider identity is not linked to a kei user",
  "identity_status": "unlinked",
  "org_id": "...",
  "workspace_id": "...",
  "provider_user_id": "...",
  "enrollment": {
    "provider": "teams|slack",
    "provider_user_id": "...",
    "org_id": "...",
    "workspace_id": "...",
    "url": "https://...",
    "expires_at": "2026-09-28T12:00:00Z"
  }
}
```

The harness must:

1. **Show the claim link privately.** The `url` is a one-time link that enrols
   the user as a workspace member with default group access; treat it as
   sensitive — show it only to the user who needs it, never log it or echo it
   to a shared channel.
2. **Honour the expiry.** `expires_at` is ~15 minutes from issuance; after that
   the url is unredeemable and the user must be re-prompted to authorize again.
3. **Re-authorize after enrollment.** Once the user visits the link and
   completes the self-enroll flow, their provider identity is linked and the
   next authorize call returns `allow` or policy-driven `deny` instead of
   `enrollment_required`.
4. **Do not auto-retry enrollment.** If the url is expired or the user declines,
   the next authorize call from the same provider identity re-issues a fresh
   enrollment. Do not loop; let the user drive re-authorization.
5. **Self-enroll grants member + default group.** Redeeming the claim link
   creates a Kei user (if new) and links the provider identity with member-level
   access and the workspace's default group. Approval-based elevation
   (managed access-request flow) is for non-default groups or elevated roles.

The `enrollment` object may be absent (no url/expires_at) when the control
plane cannot issue a claim — for example when the runtime installation has no
workspace scope or `KEI_WEB_BASE_URL` is unset. In that case fall back to
`guest_requires_signup`.

**Always show the newest link.** Every `enrollment_required` response mints a
new claim and invalidates the previous live claim for that identity. A resent
old link fails with `claim_used` (409). Do not mint extra links yourself —
each authorize call already does that. If the user has not acted on a link and
you re-prompt, show the link from the latest response, not a cached one.

The claim-link lifecycle is documented in detail at the canonical API contract:
`kei-policy-catalog docs/chat-identity-claims.md`.

## Troubleshooting setup

This section catalogs real failures observed during harness setup (e2e,
2026-10-05/06). Each entry lists the symptom, root cause, and fix. The
matching `kei-setup-doctor` skill has a condensed version for diagnosis
workflows.

### 1. oh-my-zsh alias shadows the Kei CLI

**Symptom:** `kei` runs `kubectl edit ingress` (oh-my-zsh kubectl plugin)
instead of the Kei CLI. `kei --version` returns kubectl help.

**Cause:** oh-my-zsh defines `alias kei='kubectl edit ingress'`, which
shadows the Kei binary on `PATH`.

**Fix:** `unalias kei` in the current shell, or add `unalias kei` after
`source $ZSH/oh-my-zsh.sh` in `~/.zshrc`. Use `command kei` to bypass
aliases.

### 2. kei or kei-proxy not installed, or wrong version

**Symptom:** `command -v kei` fails, or `kei --version` reports `< 0.1.13`
(resp. `kei-proxy --version` `< 0.1.26`).

**Cause:** The installer was not run, or the installed binary is outdated.

**Fix:** Re-run the installer and ensure `~/.local/bin` is on `PATH`:

```sh
curl -fsSL https://kei-cli-releases.s3.us-east-1.amazonaws.com/kei-cli/install.sh | bash -s -- -d ~/.local/bin
```

### 3. Not logged in

**Symptom:** `kei workspaces list` fails with a login error.

**Cause:** No valid Kei session. `kei login` uses device-code flow — a
person must approve in the browser.

**Fix:** Run `kei login` and approve the code in the browser. The approving
account must be an owner or admin of the organization.

### 4. No runtime installation (new machine)

**Symptom:** `~/.config/kei.yaml` does not exist, or `kei runtime bootstrap`
returns 401.

**Cause:** This machine has never been set up with Kei, or its credential was
revoked. Each machine needs its own runtime installation and credential —
credentials are never shared across machines.

**Fix:** The setup scripts (`setup-*.sh`) create a new installation
automatically. Manual path:

```sh
INSTALL_NAME="<kind>@$(hostname -s)"
WS_ID=$(kei workspaces list | grep -oE '[a-f0-9-]{36}' | head -1)
INSTALL_ID=$(kei bot init --platform cli --name "$INSTALL_NAME" --workspace "$WS_ID" | grep -oE '[a-f0-9-]{36}' | head -1)
kei bot credential --installation "$INSTALL_ID" --workspace "$WS_ID" | kei setup --control-plane-url https://app.haikeilabs.com
kei runtime bootstrap
```

The credential is piped directly into `kei setup` and is never printed to the
terminal or stored in a file.

### 5. "pending" installation status (no heartbeat yet)

**Symptom:** `kei bot status` shows `"status":"pending"`.

**Cause:** The runtime has not sent its first heartbeat. `pending` is not an
error — it simply means heartbeat has not arrived yet.

**Fix:** Wait for the next heartbeat cycle. If it stays `pending` after
several minutes, check network outbound from the runtime to the control plane
and verify `KEI_RUNTIME_TOKEN` is present in the environment. Do not attempt
to bind, rotate credentials, or restart the runtime for a `pending` status
alone.

### 6. Background heartbeat service not installed

**Symptom:** No `kei runtime service` command, or the service is not
running. The runtime may stop heartbeating after the terminal session ends.

**Cause:** `kei runtime service install` ships in HAI-406 (not yet released).

**Fix:** After upgrading kei to a version that includes `kei runtime service
install`, run:

```sh
kei runtime service install
```

Until then, ensure the process has a supervision mechanism (systemd unit,
launchd plist, container restart policy) that keeps it running.

### 7. "No registered harnesses selected" after harness add

**Symptom:** `kei harness sync --harness <kind>` prints "No registered
harnesses selected" even though `kei harness add` succeeded.

**Cause:** The policy bundle cached by `kei-proxy` is stale (HAI-403). The
new harness registration is not reflected in the bundle until the next
refresh cycle (background poll interval, or a manual policy edit).

**Fix:** Any policy edit (e.g. adding or removing a harness command policy)
triggers a bundle refresh. If no policy edit is available, wait for the
background refresh (up to 6 hours — see `kei-harness-policy
references/bundle-versioning.md`). Workaround:

```sh
# Force a bundle refresh by touching a policy
kei policies update <any-policy> --workspace WS --description "no-op refresh"
kei harness sync --harness <kind>
```

### 8. Policy bundle version rollback after switching installations

**Symptom:** After switching to a different runtime installation (new
credential, new bootstrap), the policy bundle loaded by `kei-proxy` is a
stale version from the previous installation. Governed calls use incorrect
(or empty) policy rules.

**Cause:** `kei-proxy` caches the policy bundle on disk at
`~/Library/Application Support/kei-proxy` (macOS) or
`~/.local/share/kei-proxy` (Linux) keyed by installation ID. When the
installation changes, the old cached bundle may be loaded if the cache
directory is not cleared (HAI-404).

**Fix:** Move the proxy cache directory aside before bootstrapping with the
new installation:

```sh
mv ~/Library/Application\ Support/kei-proxy ~/Library/Application\ Support/kei-proxy.bak.$(date +%s)
# or on Linux:
# mv ~/.local/share/kei-proxy ~/.local/share/kei-proxy.bak.$(date +%s)
kei runtime bootstrap
```

After confirming the new bundle is correct, remove the backup directory.

### 9. "policy bundle candidate rejected: invalid policy bundle schema" — dst_pattern does not match

**Symptom:** `kei-proxy` logs or `kei-proxy runtime bootstrap` returns:
```
policy bundle candidate rejected: invalid policy bundle schema ... dst_pattern 'web_search' does not match
```

The harness cannot make any governed calls — every `kei-proxy authorize`
returns a denial (fail-closed).

**Cause:** A harness command policy targets a bare tool name as its
`dst_pattern` (e.g. `web_search`), but the policy bundle schema requires a
`tool:` prefix (e.g. `tool:web_search`). The bare name fails schema
validation and kei-proxy rejects the entire bundle, denying everything
(HAI-372).

**Fix:** Update the policy's `dst_pattern` from the bare name to
`tool:<name>` in the Kei console (**Policies →** select the policy → edit
the destination pattern). For example, change `web_search` to
`tool:web_search` and `read_file` to `tool:read_file`.

```text
# Before (bundle rejected)
dst_pattern: web_search

# After (bundle accepted)
dst_pattern: tool:web_search
```

If the policy was created through the CLI, re-create or update it:

```sh
kei policies update <name-or-id> --workspace WS --dst-pattern tool:web_search
```

Once the fix is applied, re-run `kei runtime bootstrap` or restart
`kei-proxy serve` to reload the bundle. A future `kei-proxy` release will
accept bare names as aliases; until then kei-proxy fails closed (denies
everything) when the schema does not match.

### 10. Every governed tool call denied (fail-closed)

**Symptom:** Every `kei-proxy authorize` returns a non-zero exit. Tools that
previously worked are now denied.

**Cause:** `KEI_PROXY_DISABLED=true` is set, `KEI_RUNTIME_TOKEN` is missing,
`KEI_RUNTIME_CONTROL_PLANE_URL` is wrong, or kei-proxy is not on `PATH`.
When kei-proxy is disabled, misconfigured, or unreachable, it denies every
governed call (fail-closed, HAI-249).

**Fix:** Check environment variables:

```sh
echo "KEI_PROXY_DISABLED=${KEI_PROXY_DISABLED:-unset}"
echo "KEI_RUNTIME_TOKEN=${KEI_RUNTIME_TOKEN:+present}"
echo "KEI_RUNTIME_CONTROL_PLANE_URL=${KEI_RUNTIME_CONTROL_PLANE_URL:-unset}"
command -v kei-proxy
```

Unset `KEI_PROXY_DISABLED` or set it to `false`, inject the token from the
secret manager, and confirm the URL is `https://app.haikeilabs.com` (no
trailing `/api/v1`). Then test with a known-permitted tool:

```sh
kei-proxy authorize --user U --tool T --action A --resource R; echo $?
```

### 11. Native config is stale after policy update

**Symptom:** Policy changes in the console are not reflected in the
harness's native config (e.g. `~/.claude/settings.json` still has old
`permissions.allow` entries).

**Cause:** The background bundle refresher updates `kei-proxy`'s in-memory
policy, but does not re-render the native config. Re-rendering needs an
explicit `kei harness sync`.

**Fix:**

```sh
kei harness sync --dry-run --harness <kind>   # preview changes
kei harness sync --harness <kind>             # apply
```

See `kei-harness-policy references/bundle-versioning.md` for the 6-hour
refresh window and versioning model.

### 12. Runtime credential was lost (no recovery)

**Symptom:** The `KEI_RUNTIME_TOKEN` environment variable is missing, and
the secret manager no longer has the value. There is no backup.

**Cause:** The credential was shown once at creation and never stored.

**Fix:** Kei stores only a hash — the plaintext cannot be recovered. Rotate
the credential:

```sh
kei bot credential --installation <ID> --rotate | <secret-manager import>
```

Update the environment variable on every consumer, then restart or reload the
runtime. Each rotation invalidates the previous credential immediately.

## Validation commands

```sh
ls "$SKILLS_DIR" | grep '^kei'                          # skills installed
head -3 "$SKILLS_DIR/kei-cli/SKILL.md"                  # frontmatter starts with ---
kei-proxy runtime bootstrap | jq '.workspace_id'        # runtime scoped to a workspace
kei-proxy authorize --user U --tool T --action A --resource R; echo $?
kei harness list --installation INSTALLATION_ID --json | jq '.harnesses[].agent_name'   # registered harnesses (kei >v0.1.6)
```

## Realistic usage boundaries

- Do not paste runtime tokens into harness config
  files in a repo, or into the conversation.
- Installing skills changes what the agent knows, not what it may do. Policy in
  the workspace decides that.
- Agents are created in the console; there is no CLI command for that yet.
- The explicit Harness resource and short-lived runtime identity in the ADRs
  are planned. Do not present them as available.
- The installation-claim handshake (HAI-155) IS available for chat-platform
  identities via the claim-link enrollment flow (see section 6 above), but is
  NOT available for generic harness-to-installation linking.

## Related skills

- `kei-harness-policy` — authoring harness command policies, importing native
  rules, and syncing the rendered config. See also the
  [permissions model reference](../kei-harness-policy/references/permissions-model.md)
  for how Kei compiles policies into native config, the audit-only hook, and
  Kei-only permission management.
- `kei-openai-backends` — model format support across five families (OpenAI,
  Anthropic, Qwen, DeepSeek, GLM), including tool-definition rendering, reasoning
  adapters, and eval ModelBackend variants. Each family has distinct tool-call
  formats: Anthropic uses `input_schema` with `thinking` content blocks; OpenAI
  and DeepSeek use JSON function-calling with `reasoning_content`; Qwen and GLM
  have their own variants. The skill covers the per-family tool-definition
  schemas (`render_tools`) and reasoning-content extraction.
- `kei-runtime-setup` — the runtime installation and bootstrap half of the
  harness setup workflow.
- `kei-proxy` — the runtime binary the harness calls for governed decisions.
- `agentware-sdk` — the SDK with `KeiProxyEvaluator` and policy enforcement.
