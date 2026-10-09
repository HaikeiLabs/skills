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

The source says who the policy applies to. People and agents are the normal
sources; `harness:` is optional and narrower:

| `src` pattern | Matches |
| --- | --- |
| `*` | Everyone in the workspace, on every harness |
| `user:<id>`, `email:<address>`, `group:<name>` | A person or group, whichever harness they use |
| `agent:<id>` | An agent by its ID |
| `harness:<kind>` | Everyone using that harness kind (`claude_code`, `codex`, `opencode`, `custom`) |
| `harness:<id>` | Everyone using that harness or installation |

A `harness:` source is only for harness destinations (`shell:`, `skill:`,
`path:`, `mcp:`, or a harness tool name such as `tool:claude_code.edit`). The
catalog rejects a `harness:` source with any other destination on save
(`INVALID_ARGUMENT`). An `agent:<id>` source with an exact `tool:` or
`capability:` destination is checked at call time by `kei-proxy`, and matches
when **either** the user or the calling agent matches. Cap a broad agent permit
with a higher-priority deny.

For prebuilt harness rendering (Claude Code, Codex, OpenCode), `*` renders on
every harness and `harness:` renders on the harness it names. `user:`, `email:`
and `group:` render only when they name the v2 bundle's **subject**: the
person who owns the runtime installation (user ID, email and groups). v1
bundles carry no subject, so none of those sources render on v1. A person
source that does not render is a **skipped** policy; see
[Skipped denies withhold overlapping permits](#skipped-denies-withhold-overlapping-permits).

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
| Claude Code | `~/.claude/settings.json` | `permissions.allow` entries, e.g. `Bash(git:*)` | `permissions.deny` entries, e.g. `Bash(git push --force:*)` |
| Codex | `~/.codex/rules/kei.rules` | `prefix_rule` allow entries | `prefix_rule` `forbidden` entries |
| OpenCode | `opencode.json` | `permission.bash` allow entries | `permission.bash` deny entries |

`shell:` policies render on all three. Claude Code and OpenCode also render
`skill:` policies, and OpenCode renders `path:` policies. Codex expresses only
argv prefix rules; sync prints `not enforceable in Codex: <policy>` for each
policy it cannot express.

### Skipped denies withhold overlapping permits

A deny that cannot render is **skipped**: a `user:`, `email:` or `group:` deny
on a v1 bundle, on a v2 bundle without a subject, or on a v2 bundle whose
subject it does not name. It still comes first in precedence. So
sync withholds every lower-precedence permit whose destination overlaps it,
prints one `not rendered` line for each withheld permit, and the harness asks.
A skipped deny never becomes an allow.

| Priority | Source | Destination | Effect |
| ---: | --- | --- | --- |
| 100 | `group:admins` | `shell:git push --force` | deny |
| 10 | `*` | `shell:git` | permit |

Captured from `kei` built at kei-cli main against a local fixture bundle in a
sandboxed home, starting from `{"permissions":{"allow":["Bash(npm test)"]}}`.
The 26 added hook lines are shortened here.

v2 bundle, no subject (a subject outside `admins` prints the same):

```text
$ kei harness sync --harness claude_code --dry-run
not rendered in Claude Code: allow git (a higher-precedence user:/group: deny overlaps it; the harness will ask)
~/.claude/settings.json: +26  -0   (Kei-managed entries updated)
--- ~/.claude/settings.json
+++ ~/.claude/settings.json (Kei render)
@@ -3,5 +3,31 @@
     "allow": [
       "Bash(npm test)"
     ]
+  },
+  "hooks": {
     … (report-only kei-proxy hook entries)
```

On a v1 bundle, sync prints one more line:

```text
Claude Code: 1 user:/group: policies not rendered; the v1 policy bundle carries no subject (upgrade the catalog to serve v2)
```

`permissions.allow` stays `["Bash(npm test)"]`, and there is no
`permissions.deny`. Claude Code **asks** before `git push --force` and before
every other `git` command.

v2 bundle whose subject is in `admins`: there is no `not rendered` line, and
both entries render:

```text
$ kei harness sync --harness claude_code --dry-run
~/.claude/settings.json: +31  -1   (Kei-managed entries updated)
@@ -1,7 +1,37 @@
 {
   "permissions": {
     "allow": [
-      "Bash(npm test)"
+      "Bash(npm test)",
+      "Bash(git:*)"
+    ],
+    "deny": [
+      "Bash(git push --force:*)"
     ]
```

Claude Code runs other `git` commands without asking and denies
`git push --force` natively, because deny entries beat allow entries.

A permit that does not overlap the skipped deny still renders. For example,
`*` `shell:git status` at priority 10 renders `Bash(git status:*)`.

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

This prints a unified diff to stdout (`--- <file>` / `+++ <file> (Kei render)`)
without overwriting the native config file. Note: because the renderer
reformats the entire file, the diff may be large even when only one entry
changes. Review the output carefully — especially note any entries that would
be removed.

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

## Known limitations (as of 2026-10-09)

### A catch-all deny blocks every permit

Denies render into the native deny list, and Claude Code applies deny entries
before allow entries. A catch-all `shell:*` deny renders as `Bash(*)` in
`permissions.deny` and blocks every permitted command too. Scope denies to the
command prefix you mean.

### Skipped person-sourced denies make the harness ask

A `user:`, `email:` or `group:` deny that does not name the bundle subject is
skipped, and the permits it overlaps are withheld (see
[Skipped denies withhold overlapping permits](#skipped-denies-withhold-overlapping-permits)).
The harness asks for those commands instead of running them. Read the
`not rendered` lines in `kei harness sync --dry-run` output before you sync.

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
