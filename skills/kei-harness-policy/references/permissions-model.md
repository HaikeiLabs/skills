# How Kei manages harness permissions

This document explains how Kei governs what commands and tools a coding-agent
harness (Claude Code, Codex, OpenCode) may run on the host. It covers the
translation from Kei policies to native harness config, the Kei audit-only hook,
how to make Kei your sole permission source, current limitations, and how to
report bugs.

## How it works

Kei governs harness permissions in three layers that work together:

### 1. Policy creation

You author policies in the Kei control plane using `kei policies create` or the
web console. Each policy has a `src` (who), `dst` (what), and `effect`
(`permit` or `deny`). For harness commands the `dst` uses one of three schemes:

| Scheme | Matches | Example |
| --- | --- | --- |
| `shell:<prefix>` | A command whose first token equals `<prefix>`, or begins `<prefix> ` | `shell:git` permits any `git` invocation |
| `skill:<name>` | A skill the harness may load | `skill:kei-agents` permits the Kei agents skill |
| `path:<prefix>` | A filesystem path prefix the harness may access | `path:/workspace/project` permits access under that directory |

The source identifies the harness kind:

| `src` pattern | Matches |
| --- | --- |
| `harness:claude_code` | The single registered Claude Code harness on the installation |
| `harness:codex` | The single registered Codex harness |
| `harness:opencode` | The single registered OpenCode harness |
| `harness:<id>` | A harness by its ID |
| `agent:<id>` | An agent by its ID |
| `harness:custom` | Any custom harness |

For prebuilt harness rendering (Claude Code, Codex, OpenCode), only
`harness:<kind>`, `harness:<id>`, and `agent:<id>` are resolved. `group:`,
`user:`, and `org:` sources are skipped — they apply to `kei-proxy` decisions,
not to native config rendering. Policies that follow the logged-in user's groups
(e.g. `group:developer`) are planned.

### 2. Bundle compilation

Policies targeting a runtime installation are compiled into a **policy bundle**
(the same bundle that governs tool-call ABAC). The bundle is identified by a
`bundle_id` (UUIDv7), a strictly increasing `bundle_version` (per installation),
and a `policy_revision` (workspace-wide counter).

See [`references/bundle-versioning.md`](bundle-versioning.md) for the full
versioning model, expiry, and refresh lifecycle.

### 3. Native config rendering: `kei harness sync`

`kei harness sync` reads the current policy bundle and renders the matched
policies into the harness's native config format:

| Harness | Native config file | Permits rendered as | Denies rendered as |
| --- | --- | --- | --- |
| Claude Code | `~/.claude/settings.json` | `permissions.allow` array entries | `permissions.deny` array entries |
| Codex | `~/.codex/rules/kei.rules` | `prefix_rule` entries | Deny `prefix_rule` entries |
| OpenCode | `opencode.json` | `permission.bash` array entries | `permission.deny` array entries |

Only `shell:` policies have a native equivalent in the harness config. `skill:`
and `path:` policies are not yet rendered into native config for Claude Code,
Codex, or OpenCode; a fix is in progress.

After sync, the harness reads its native config and permits or denies each
command at runtime without consulting Kei for every invocation. This is the key
difference between harness command policy and tool-call ABAC: command decisions
are made locally by the harness from the rendered config.

### 4. The Kei audit-only hook

In addition to the native config, `kei harness sync` installs a lightweight
**Kei hook** into the harness — a PreToolUse/PostToolUse callback that runs
alongside every tool call the harness executes.

The hook's contract is strict:

- **Reports only** — it records the tool name, phase (PreToolUse /
  PostToolUse), the harness's native decision (allowed/denied), and an HMAC
  digest of the tool arguments. Arguments are encrypted to the customer's
  audit-encryption keys (see ADR-030) and are never logged raw.
- **Always exits 0** — it never blocks, delays, or changes the outcome of a
  tool call.
- **Never allows or denies** — the allow/deny decision comes exclusively from
  the harness's native config (which Kei rendered in step 3).

The hook exists for observability: workspace admins can see which tools were
called, what the native config decided, and which policy bundle was active —
all without the agent or user taking any extra action.

### 5. Fallback for unmatched commands

If a command does not match any entry in the native config (neither allow nor
deny), the harness falls through to its own built-in permission logic:

- **Own entries** — any pre-existing allow/deny entries the user added before
  Kei was installed remain active.
- **Permission mode** — the harness's default behavior (usually `ask`, which
  prompts the user before running an unrecognised command).

This means an unmatched command can still be allowed if your own allow entries
permit it, or if the harness permission mode is set to auto/accept rather than
ask.

### 6. Custom harnesses and connectors

For custom harnesses (`--kind custom`) and governed connectors (data-source
calls through `kei-proxy connector invoke`), there is no native config to
render. These paths are evaluated by `kei-proxy` directly:

- If a policy matches, `kei-proxy` permits or denies accordingly.
- If no policy matches, the decision is **deny** (fail-closed).

This ensures that any tool or connector that is not explicitly permitted is
blocked by default.

## Kei-only permission management

Once Kei is managing your harness permissions, you may want Kei to be the
**sole source** of what is allowed and denied. Here is how to achieve that:

### After every policy change: `kei harness sync`

Kei does not auto-re-render native config when policies change (see
[Known limitations](#known-limitations) below). Run sync after every policy
create, update, delete, or reorder:

```sh
kei harness sync --harness <kind>   # re-render native config for one harness kind
```

Without sync, the harness continues using the previously rendered native config,
which may be stale.

### Preview before applying

Always preview what sync will change before writing:

```sh
kei harness sync --harness <kind> --dry-run
```

This renders the policy bundle to stdout without overwriting the native config
file. Review the output carefully — especially note any entries that would be
removed.

### Remove your own allow/deny entries

Kei only edits entries it owns (see "Which entries does Kei own?" below). Any
entries you added by hand remain in the config. To make Kei the only source:

1. Run `kei harness sync --harness <kind>` to establish Kei's entries.
2. Remove your own allow/deny entries from the native config file.
3. Keep the harness in its default permission mode (usually `ask`) — do not set
   it to `allow-all` or equivalent.
4. Run `kei harness sync --harness <kind>` again to confirm the file only
   contains Kei-managed entries.

**Kei keeps a backup** of the native config file before every write at
`<config-file>.kei-backup-<timestamp>`. If something goes wrong, restore from
the backup.

### Which entries does Kei own?

Kei marks its entries with a comment or structural convention unique to each
harness (e.g. a `# kei-managed` comment in Claude Code's `settings.json`). It
only adds, updates, or removes entries it owns — it never touches entries it did
not create. This means:

- Your hand-written entries are safe across syncs.
- But they also persist — if you want Kei to be the only source, you must remove
  them yourself (see above).

## Known limitations (as of 2026-10-06)

### Deny policies and skill: permits not rendered into Claude settings

Claude Code's `settings.json` supports a `permissions.deny` array, but the
current `kei harness sync` renderer does not write deny entries into it. Deny
policies and `skill:` permits are **not reflected in Claude Code's native
config**; a fix is in progress.

### Stale Kei hook after harness or agent change

When a harness is re-registered (e.g. a new agent ID, a different kind, or a
new runtime installation), the old Kei hook may remain in the harness alongside
the new one. The hooks do not conflict (both exit 0), but the old hook reports
against a stale installation or bundle, which pollutes the audit trail.

**Workaround:** After changing the harness or agent, inspect the harness's hook
configuration and remove any stale Kei hooks by hand.

### Sync is manual

There is no automated trigger that re-runs `kei harness sync` after a policy
change. The runtime reuses the current bundle while policies and harnesses are
unchanged (up to 6 hours); after a change, run `kei harness sync` again.

**Workaround:** Run `kei harness sync` manually after every policy change. Or
set up a cron job / scheduled task that runs `kei harness sync --harness <kind>`
periodically (e.g. every 15 minutes) to pick up changes.

## Report a bug

If you believe Kei is allowing a command it should deny, or denying a command it
should allow, please report it through the **Report a bug** button in the Kei
console, or file an issue in the
[HaikeiLabs/skills](https://github.com/HaikeiLabs/skills/issues) repository.

### What to include

| Item | How to get it |
| --- | --- |
| Harness kind | `claude_code`, `codex`, `opencode`, or `custom` |
| `kei --version` | `kei --version` |
| `kei-proxy --version` | `kei-proxy --version` |
| Proxy policy state | `kei-proxy policy show` (includes state, version, digest, revision) |
| Dry-run output | `kei harness sync --harness <kind> --dry-run` |
| Expected behaviour | What you expected to happen |
| Actual behaviour | What actually happened |

### What NEVER to include

- **Runtime tokens** — never paste `KEI_RUNTIME_TOKEN` or any credential value.
- **`~/.config/kei.yaml` contents** — the config file contains the runtime
  credential and installation ID.
- **Other credentials** — no API keys, passwords, or session tokens.

If you are unsure whether a piece of information is sensitive, leave it out.
The Kei team can ask for additional details if needed.
