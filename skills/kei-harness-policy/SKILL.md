---
name: kei-harness-policy
description: "Govern harness command execution through Kei policies — import native allow/deny rules from Claude Code, Codex, or OpenCode into Kei policy bundles; create/update/delete shell:/skill:/path: policies; register custom/SDK agent-keyed harnesses and sync tool registrations; credential injection via kei:// references. Use when running `kei policies list|get|create|update|delete|import` or `kei harness add|sync|list|remove`. Covers ADR-029 harness-command-policy (3NF harness resource keyed by agent; kinds claude_code|codex|opencode|custom), ADR-028 kei.match/v1, HP-C1 rev1 policy API shape, HP-C3 harness adapter/tool discovery, HP-C5 bundle trust, HP-C6 report-only hook, and credential resolution for shell: dst commands."
---

# Harness command policy

## Compatibility at a glance

| Harness | Policy source | Enforceable by sync? |
| --- | --- | --- |
| Claude Code | `shell:` policies | Yes, rendered to native command permissions |
| Codex | `shell:` policies | Yes, rendered as Codex shell rules |
| OpenCode | `shell:` policies | Yes, rendered to native bash permissions |
| Codex | group policies | No. Group policies are not rendered into Codex rules. |

**Requires kei v0.1.7 or newer**, the first release with harness policies and
`kei harness`; every supported kei release has them.

Kei governs a coding-agent harness in two layers:

1. **Tool-call policy** — the standard Kei ABAC path: agent tool calls go
   through kei-proxy — the `kei-proxy serve` socket (`POST /v1/authorize` in a
   session, through the agentware socket client), or the one-shot
   `kei-proxy authorize` CLI as the fallback with no daemon — and the runtime
   PDP decides from the bundle (ADR-026, ADR-028).
2. **Harness command policy** — the harness's native terminal/command execution
   layer (e.g. Claude Code's bash tool, Codex's shell, OpenCode's permission
   system). The harness decides natively from a config file rendered by
   `kei harness sync`; Kei does not intercept each command. The report-only
   hook (HP-C6) that sync installs records each call and the harness's native
   decision in the audit trail without blocking.

This skill owns layer 2: translating between what the Kei control plane
understands (`dst: shell:git`, `dst: skill:kei-agents`) and what each harness
understands natively (Claude Code `permissions.allow`, Codex `prefix_rule`,
OpenCode `permission.bash`).

## Key facts

- **Version.** If `kei --version` reports something older than v0.1.7, use
  the web console or the Kei API (`kei-api` skill) instead. When this skill
  and `kei help` disagree, **trust `kei help`** and mention the difference to
  the user.
- **Sync renders, Kei does not intercept.** `kei harness sync` renders the
  policy bundle into each harness's native config, and the harness enforces it
  itself. Sync is manual: run it after every policy change. Preview with
  `kei harness sync --harness <kind> --dry-run`.
- **Sync edits only Kei-managed entries and backs up first.** A local sync
  ledger records the entries the last sync wrote; the next sync replaces only
  those and leaves your own entries and key order as they are. Before it
  changes a file it writes `<file>.kei-backup-<timestamp>`. Kei keeps **one**
  backup per file (kei 0.1.31 or later): the config from before the most
  recent successful sync. To roll back by hand, copy that file over the native
  config.
- **Kei does not deny unmatched commands on desktop harnesses.** A command no
  policy matches falls through to the harness's own entries and default
  permission mode (usually `ask`). Custom harnesses and governed connectors
  deny by default (fail-closed).
- **The hook only audits.** The report-only hook that sync installs
  (`kei-proxy hook <harness>`, HP-C6) records each call and the harness's
  native decision. It never decides, blocks or answers a permission prompt,
  and there is no report-only enforcement mode.
- **Claude Code decisions are observed, not computed.** The hook writes a
  separate `decision` event per call (`allow`, `deny` or `ask`); `pre` stays
  `native_decision: unknown`. This needs kei-proxy 0.2.5 or newer, Claude Code
  2.1.119 or newer, and kei v0.1.24 or newer. On older Claude Code, sync
  installs only the `PreToolUse` and `PostToolUse` hooks and prints a warning,
  and no decision events are recorded.
- **Desktop harnesses share one installation.** Claude Code, Codex and OpenCode
  on one machine are sessions of the same runtime installation, and
  sync discovers them automatically. `kei harness add` is only for custom/SDK
  harnesses (`--kind custom`). Pi is governed by the kei-lime-pi extension
  instead, which kei-proxy (0.2.4 or newer) decides at call time; sync renders
  nothing for it.

## Answer checklist

Answer from this skill: the commands, flags, bundle fields, and boundaries are
on this page and in `references/`, so you do not need to search a codebase
first. If something is not here, say so. In every answer:

- **Any `kei policies` or `kei harness` command** (including
  `kei harness sync --dry-run`): say it needs kei v0.1.7 or newer (kei >
  v0.1.6; check `kei --version`).
- **Writing a policy:** use `kei policy create --workspace WS --group GROUP
  --allow TARGET` (or `--deny TARGET`). The older `kei policies` alias is
  deprecated; do not suggest `--name`, `--src-pattern`, or `--dst-pattern`
  flags for the installed policy command.
- **`kei harness sync` for Claude Code, Codex, or OpenCode** (including any
  import answer): always say that desktop harnesses are auto-discovered from
  the runtime installation, so no `kei harness add` is needed (that is only
  for custom/SDK harnesses). Sync edits only Kei-managed entries
  and saves `<config-file>.kei-backup-<timestamp>` before every write; only
  that one backup is kept (the next successful sync replaces it). Roll back by
  copying the backup over the native config.
- **Report-only / audit-without-blocking:** answer in three parts, even when
  short: (1) the report-only hook (HP-C6) exists: `kei harness sync` installs
  `kei-proxy hook <harness>`, which only records each call and the harness's
  native decision and never decides or blocks; (2) there is no report-only
  enforcement mode and no `--policy-mode` flag, so violations cannot be
  logged without being enforced; (3) to preview a change, use
  `kei harness sync --dry-run` or list the policies to check coverage.
- **Credentials for `shell:` commands:** `kei-proxy run` resolves each
  `kei://connectors/<id>/<field>` reference at run time and injects the value
  into the child process only; the agent never reads or stores it, and it is
  never in the policy. Say this is the same pattern as governed connector
  calls (credential release uses the same connector policy check and secret
  resolution).
- **`policy_bundle_expired`:** the bundle passed its `not_after` expiry
  (ADR-026 §4). Refresh is normally automatic (the background refresher in
  `kei-proxy serve`); an offline runtime cannot fetch new bundles until
  connectivity is restored. Fix: restore connectivity, force a fresh bundle
  fetch with `kei-proxy policy sync` (or `kei-proxy runtime bootstrap`), then
  run `kei harness sync` to re-render the native config from the fresh bundle.
- **`STALE_BUT_VALID`:** the refresh is overdue (no successful refresh within
  `stale_after_seconds`, default 300 s) but the bundle is still valid until
  `not_after`; after that every governed call is denied. Check connectivity to
  the control plane, the control-plane URL, DNS, and the runtime token
  (expired or rotated). `kei-proxy policy sync` forces a fresh fetch.
- **Bundle versions:** name the fields (`bundle_id`, `bundle_version`,
  `policy_revision`) and say when each changes. Also say the catalog reuses
  the current bundle for up to 6 hours (the reuse window) and re-issues it at
  half-life. Point to `references/bundle-versioning.md`.

## Concepts

| Term | Meaning |
| --- | --- |
| **Harness command policy** | A Kei ABAC policy whose `dst` follows the `shell:`, `skill:`, or `path:` scheme — governs what commands and skills a harness agent may run on the host without asking (ADR-029 §2). |
| **`shell:` dst** | A command prefix the harness may run without asking. `shell:git` permits any `git` invocation; `shell:herdr` permits herdr commands. |
| **`skill:` dst** | A skill name the harness may load without asking. `skill:kei-agents` permits the Kei agents skill. |
| **`path:` dst** | A filesystem path prefix the harness may read or write without asking. `path:/workspace/project` permits access under that directory. |
| **`kei.harness-match/v1`** | The match dialect for harness command policies. Same matching rules as `kei.match/v1` (ADR-028 §5) but with the harness-specific dst candidates above. A policy never combines `shell:`, `skill:`, and `path:` in one dst — write separate policies. |
| **Native config** | Each harness's own allow/deny list: Claude Code `~/.claude/settings.json` → `permissions.allow`, Codex `prefix_rule` lines in `~/.codex/rules/*.rules` (Kei renders its own into the Kei-owned `kei.rules` and never touches your `default.rules`), OpenCode `opencode.json` → `permission.bash`. |
| **Report-only hook** | `kei-proxy hook <harness>`, which `kei harness sync` installs in each desktop harness (Claude Code and Codex hooks, an OpenCode plugin). It writes each tool call and the harness's native decision to the audit trail, always exits 0, and never blocks or decides (HP-C6, ADR-029 §6). It is not an enforcement mode: see "Report-only hook (HP-C6)" below. |
| **`kei harness add`** | Register a custom/SDK harness type (`--kind custom`) so its tools are known to the control plane. Desktop harnesses (claude_code, codex, opencode) are auto-detected by sync — do NOT use `add` for them. `--installation` and `--agent` are optional with defaults (single installation, default agent). |
| **`kei harness sync`** | Fetch the policy bundle and render it into the harness's native config format (Claude Code `permissions.allow`, Codex `prefix_rule`, OpenCode `permission.bash`). Auto-discovers desktop harnesses (claude_code, codex, opencode) from the registered runtime installation — no separate `add` needed. |

## Retrieval sources

| Source | How to retrieve | Use for |
| --- | --- | --- |
| Installed binary | `kei help`, `kei policy -h`, `kei harness -h` | Exact subcommands, flags, and allowed values for the installed version |
| Policy contract | `docs/contracts/policy-set-v1.schema.json`, `docs/contracts/policy-bundle-v1.schema.json` | The JSON schema a policy must satisfy |
| Harness docs | The harness's own skills documentation | How a particular harness loads native config (Claude Code's `settings.json`, Codex's `~/.codex/rules/*.rules`, OpenCode's `opencode.json`) |
| ADR-029 | `docs/adr/029-harness-command-policy.md` | Design rationale, shell:/skill:/path: schemes, report-only hook, match dialect |
| Permissions model | [`references/permissions-model.md`](references/permissions-model.md) | Sources, native rendering per harness, the bundle subject, skipped denies with captured `kei harness sync` output |
| Guide | [`docs/guides/create-policies.md`](../../docs/guides/create-policies.md) | Reader-facing walkthrough of creating policies, with the same worked example |
| Bundle versioning | [`references/bundle-versioning.md`](references/bundle-versioning.md) | Bundle identity fields (bundle_id, bundle_version, policy_revision), lifecycle, polling/refresh, rollback protection, state machine, troubleshooting |

## Quick reference

| Task | Command | Needs login |
| --- | --- | --- |
| List policies for a workspace | `kei policy list --workspace WS` | yes |
| Get a policy | `kei policy get ID --workspace WS` | yes |
| Create a group allow/deny policy | `kei policy create --workspace WS --group GROUP --allow TARGET` (or `--deny TARGET`) | yes |
| Test a policy | `kei policy test --workspace WS --as group:GROUP TARGET` | yes |
| Delete a policy | `kei policy delete ID --workspace WS` | yes |
| Register a custom/SDK harness | `kei harness add --kind custom [--installation ID] [--agent ID]` | yes |
| Sync tool registrations | `kei harness sync [--harness KIND] [--manifest PATH] [--dry-run]` | yes |
| List registered harnesses | `kei harness list --installation ID [--json]` | yes |
| Remove a harness | `kei harness remove AGENT_ID --installation ID` | yes |

All `policies` and `harness` commands accept `--api-url URL` to override the
default control-plane URL.

For a custom SDK harness, `kei harness sync --harness custom --manifest
tools.json` registers local tool metadata (kei >= 0.1.33). Agentware can also
register `ToolSpec` declarations through the runtime socket at
`POST /v1/tools:register`.

## When to use `kei harness add`

`kei harness add` registers a harness kind so the control plane knows which
native config format to render. It is **only for custom/SDK harnesses**
(`--kind custom`).

**Desktop coding harnesses (Claude Code, Codex, OpenCode) are sessions**
of one runtime installation per machine. They are auto-discovered by
`kei harness sync` — you do NOT need to run `kei harness add` for them.
Installing Codex next to Claude Code on the same machine? Just run
`kei harness sync`; both are detected from the same installation.

| Use case | Command |
|---|---|
| You built a custom SDK harness | `kei harness add --kind custom [--installation ID] [--agent ID]` |
| Claude Code / Codex / OpenCode on a workstation | `kei harness sync` (no `add` needed) |
| Pi on a workstation | Install the Kei extension: `pi install git:github.com/HaikeiLabs/skills` and `pi install git:github.com/HaikeiLabs/kei-lime-pi` (no `add`, no `sync`) |

**Pi is governed by an extension, not by sync.** The kei-lime-pi extension
(`@haikeilabs/kei-lime-pi`) sends Pi's `read`, `write`, `edit` and `bash`
calls and registered Kei v2 connector calls to the local kei-proxy, which
decides each one at call time (Bash through `shell:` policies, which can be
scoped with `harness:pi`). `kei harness sync` renders nothing for Pi. It needs
kei-proxy 0.2.4 or newer on the same machine; the extension holds no policy
engine and never receives the runtime credential, and a missing socket or a
denial blocks the call.

**Flags:**

- `--installation` — defaults to the single installation on this machine
  (fails with an error if there are multiple).
- `--agent` — defaults to the default agent on that installation (fails with
  `no default agent found` if none is set). Set one with
  `kei bot agents add --default`.

**Errors:**

- `ALREADY_EXISTS` — that agent already has a harness on that installation.
  The harness identity is `(installation_id, agent_id)`, and it is unique per
  native kind.
- `no default agent found` — the installation has agents but none is marked
  default. Pass `--agent AGENT_ID` or run `kei bot agents add --default`.

## Authoring harness command policies

### dst schemes

| Scheme | Matches | Example | Effect |
| --- | --- | --- | --- |
| `shell:<prefix>` | A command whose first token (after shell normalization) equals `<prefix>`, or begins `<prefix> ` | `shell:git` | Permits all `git` subcommands |
| `skill:<name>` | A loaded skill by its registered name | `skill:kei-agents` | Permits the agent to load and use that skill |
| `path:<prefix>` | A file path the harness may access | `path:/workspace/acme` | Permits read/write under that directory |

Credentials for `shell:` dst commands use `kei://connectors/<id>/<field>`
references resolved by `kei-proxy run` (see "Credential injection for shell:
dst commands" below).

### Pattern rules (ADR-028 §5, `kei.match/v1`)

Every pattern is an exact, case-sensitive match except:

| Pattern | Matches |
| --- | --- |
| `*` | anything |
| `<scheme>:*` | any non-empty value in exactly that one-segment scheme |
| `*@<domain>`, `email:*@<domain>` | an email whose part after the last `@` equals `<domain>`, ignoring case (the only case-insensitive form) |

A star anywhere else is a literal. `shell:git*` matches only the literal string
`git*`.

### Precedence (ADR-028 §2)

1. `priority` descending;
2. at equal priority, `deny` before `permit`;
3. then policy `id` ascending.

The first eligible policy whose `src` and `dst` both match decides. If no
policy matches, the harness falls through to its own native permission mode
(usually `ask` for native harnesses; custom harnesses and connectors deny by
default).

### Pattern semantics

In a harness command policy, **src-pattern** says **who** the policy applies to,
and **dst-pattern** says **what** it governs.

| Field | What it identifies | Examples |
| --- | --- | --- |
| src-pattern | Who: a person, group, agent, everyone, or (optionally) a harness | `user:<id>`, `group:developers`, `agent:<id>`, `*`, `harness:opencode` |
| dst-pattern | Command prefix after shell normalization, skill, path, or MCP tool | `shell:git`, `shell:herdr`, `shell:rm`, `skill:kei-agents`, `path:/workspace` |

### Sources

- **People and agents are the normal sources.** `user:`, `email:`, `group:`,
  `agent:` and `*` apply whichever harness produces the call.
- **`*` only meaningfully applies to harness command policies** (`shell:`,
  `skill:`, `path:`) where `kei harness sync` renders it against every
  harness. For `tool:` or `capability:` dst policies, `*` from the CLI
  grants nothing because the CLI does not establish a bundle subject —
  use `user:` or `group:` instead (HAI-673).
- **`harness:<kind>` / `harness:<id>` is optional and narrower**, for rules that
  differ by harness ("Codex may never run `rm`"). It applies to everyone on
  that harness. It is valid only with a harness destination (`shell:`,
  `skill:`, `path:`, `mcp:`, or a harness tool name such as
  `tool:claude_code.edit`); the catalog rejects any other destination on save
  with `INVALID_ARGUMENT`.
- **`agent:<id>` is a source principal** (HAI-673). When used with an exact
  `tool:` or `capability:` destination it is checked at call time by
  `kei-proxy`: it matches when **either** the user or the calling agent
  matches. A broad agent permit can therefore grant around a user's narrower
  rules; cap it with a higher-priority deny (for example `agent:<id>`
  `shell:git push --force` deny at 60 over `agent:<id>` `shell:git` permit at
  50). An `agent:` source with a harness destination is rendered by
  `kei harness sync`. The `--agent-id` CLI flag is a scope column that narrows
  which agent a policy applies to — it is not a source principal.

### Destinations beyond the harness

Tool-call policies use `tool:<name>` (one exact name, no wildcards) or
`capability:<name>` (exact). A connector-wide grant names only the connector
(`selector_v2` with `connector_id` and nothing else; the console's **All tools
on this connector**). It covers every tool bound to that connector, including
tools added later, and a higher-priority deny on one tool still carves it out.
These are decided by kei-proxy at run time (the `kei-proxy serve` socket
authorize route, or the `kei-proxy authorize` CLI fallback), not rendered.

### Examples

**Create and test a group shell policy:**

```sh
kei groups create --name developers --workspace WORKSPACE
kei policy create --workspace WORKSPACE --group developers --allow shell:git
kei policy test --workspace WORKSPACE --as group:developers shell:git
```

The CLI policy is a group policy; it is not rendered into Codex shell rules by
`kei harness sync`. For harness-native command policy syntax and rendering,
use the rendered policy source table above and verify against `kei policy -h`.

## Importing from native harness config

Each coding harness has a different native format. `kei policies import` reads
the harness's native config and creates one Kei policy per entry. The `--from`
flag selects the harness format (and its default source location):

| Harness | Native location | `--from` value | Translation |
| --- | --- | --- | --- |
| Claude Code | `~/.claude/settings.json` → `permissions.allow` | `claude` | Each array entry becomes a `shell:<entry>` permit at priority 100 |
| Codex | Every `~/.codex/rules/*.rules` file (for example `default.rules`) → `prefix_rule` | `codex` | Each `prefix_rule` entry becomes a `shell:<prefix>` permit at priority 100 |
| OpenCode | `opencode.json` → `permission.bash` | `opencode` | Each array entry becomes a `shell:<entry>` permit at priority 100 |

```sh
# Preview (dry run by default) Claude Code's existing allow list
kei policies import --from claude --workspace my-workspace

# Create the policies (prompts for confirmation)
kei policies import --from claude --workspace my-workspace --apply
```

`import` is a **dry run by default**: it prints the policies it would create and
stops. Pass `--apply` to create them (it prompts `Create N policies? [y/N]`).
`--file PATH` overrides the source file or directory, `--src PATTERN` overrides
the source pattern (default `harness:<kind>`), and `--out FILE` writes the
proposed policy-set JSON to a file. There is no `--dry-run` flag — the default
is already a dry run.

## Rendering native config: `kei harness sync` (there is no `policies export`)

Preview with `kei harness sync --harness claude_code --dry-run`; it requires
kei >v0.1.6.

There is no `kei policies export` command. The native config file is rendered by
`kei harness sync`, which reads the current policy bundle and writes the
harness's native config (Claude Code `permissions.allow`/`deny`, Codex
`prefix_rule` lines in the Kei-owned `~/.codex/rules/kei.rules`, which it
rewrites whole and which leaves your `default.rules` untouched, OpenCode
`permission.bash`). `shell:` policies render on all
three; Claude Code and OpenCode also render `skill:`, and OpenCode renders
`path:`. See "Registering a harness and syncing tools" below.

## Checking coverage (there is no `policies verify` yet)

There is no `kei policies verify` command yet. To check coverage, list the
policies and confirm by hand:

```sh
kei policies list --workspace my-workspace --json
```

- Every `shell:` command you expect to allow has a matching `shell:<prefix>`
  permit.
- No two `shell:` policies have an identical dst and effect (duplicates).
- Unmatched commands fall through to the harness's native default (usually
  `ask`). Do not add a catch-all `shell:* deny`. It renders into Claude Code
  `permissions.deny`, where deny beats allow, so it blocks every permitted
  command too (see "Deny rendering and skipped denies" below).
- Read every `not rendered` line in `kei harness sync --dry-run` output. Each
  one names a permit that was withheld because a skipped deny overlaps it.

## Registering a harness and syncing tools

A harness is a property of an **installation-agent assignment** (3NF): its
identity is `(installation_id, agent_id)`, and the console labels these
harnesses "agents". Before `kei harness sync` can render native config, the
agent must already be attached to the installation (`kei bot agents add`).

**Desktop harnesses (claude_code, codex, opencode) are auto-discovered.**
You do NOT need `kei harness add` — just sync:

```sh
# 1. Sync: fetch the policy bundle and render the native config
#    (desktop harnesses are detected automatically from the installation)
kei harness sync --harness claude_code
```

**Custom/SDK harnesses** need explicit registration first:

Register custom tools with `kei harness sync --harness custom --manifest
tools.json` (kei >= 0.1.33) or Agentware `ToolSpec` over
`POST /v1/tools:register`.

```sh
# 1. Register a custom harness for an assigned agent
kei harness add --kind custom [--installation ID] [--agent ID]

# 2. Sync: fetch the policy bundle and render the native config
kei harness sync --harness custom
```

`--kind` is one of `claude_code`, `codex`, `opencode`, or `custom`. Native
kinds (`claude_code`, `codex`, `opencode`) are unique per installation and
auto-detected by sync; multiple `custom` harnesses may be registered. `kei
harness sync` fetches the current policy bundle with the runtime token and
renders the native config for the matching harness kind; `--harness KIND`
limits the sync to one kind.

`--dry-run` prints a unified diff to **stdout** showing what `kei harness sync`
would write (`--- <file>` / `+++ <file> (Kei render)`), without modifying the
config file. Before it writes, sync saves the old file as
`<file>.kei-backup-<timestamp>`; a file with no changes is not rewritten.
Writes are atomic (temp file, then rename). The dry run also prints
`Would remove earlier Kei backup <path>` for each backup a real sync would
prune.

**One backup per file and per skill (kei 0.1.31 or later).** Each managed
native config keeps one `<file>.kei-backup-<timestamp>`, and each managed
skill keeps one copy under `skill-backups/<kind>/` in the sync ledger dir
(`~/.config/kei/harness-sync/`). The backup holds the state from before the
most recent successful sync. The next successful sync makes a new backup and
deletes the older one (`Removed earlier Kei backup <path>`); leftover backups
from older kei versions are pruned to the newest. A failed sync restores the
files it already wrote, deletes its own fresh backups, and leaves the previous
backup untouched. Only Kei's exact names are pruned; other files are kept. To
roll back by hand, copy the backup over the native config, for example
`cp ~/.claude/settings.json.kei-backup-<timestamp> ~/.claude/settings.json`.
Copy it somewhere else first if you want to keep it past the next sync.
Sync removes the entries its previous run wrote (recorded in a local sync
ledger), merges in the current ones, and keeps your own entries and key order,
so the diff shows only Kei-managed changes. Run sync after installing new Haikei skills or
after a policy change.

## Bundle renewal

Policy bundles carry a `not_after` expiry (ADR-026 §4). When a bundle expires,
`kei-proxy` denies every governed call with `reason_code: policy_bundle_expired`.
The harness command policies in the bundle expire at the same time — the
harness's native config falls back to its own default permission mode (usually
`ask` for native harnesses) until the bundle is renewed.

While `kei-proxy serve` is running, a background refresher polls the current
bundle on the bundle's `refresh.poll_interval_seconds` (clamped to 30–300 s,
with jitter) and swaps in a new enforceable bundle; a rejected candidate never
replaces the active one, and a failing refresh ages the active bundle into
`stale_but_valid` until it expires at `not_after`. `kei-proxy policy show`
reports the persisted bundle's version, digest, revision, validity, and state
offline (it never prints bundle contents), and `kei-proxy policy sync` forces an
immediate fetch and persist. If the runtime is disconnected for longer than the
validity window:

1. Re-establish connectivity (check network, control-plane URL, DNS).
2. Run `kei-proxy policy sync` (or `kei-proxy runtime bootstrap`) to force a
   fresh bundle fetch.
3. Run `kei harness sync --harness KIND` to re-render native config from the
   fresh bundle.

**Rollback protection.** kei-proxy remembers the highest `bundle_version` the
installation has activated and rejects any candidate with a `bundle_version`
at or below it, keeping the active bundle. It also rejects a bundle whose
audience (installation, org, workspace) does not match. If the catalog serves
an older version, check that the installation credential targets the right
workspace, then run `kei-proxy policy sync`. Bundle identity fields and the
lifecycle are in
[`references/bundle-versioning.md`](references/bundle-versioning.md).

For diagnosis of a stale or expired bundle, see the `kei-setup-doctor` skill.

## Credential injection for shell: dst commands

Credentials are resolved through `kei-proxy`, not embedded in policies; the
agent never reads or stores raw credentials.

A harness command policy never carries a credential. When a command needs one
(e.g. a GitHub token for `git push`), the agent runs it through `kei-proxy run`
and passes a **reference** instead of the secret:

```sh
GH_TOKEN=kei://connectors/<connector-id>/token kei-proxy run -- git push
```

- References have the form `kei://connectors/<connector-id>/<field>`. Every
  environment variable whose value is such a reference is resolved;
  `--connector <id>` optionally restricts them to one connector.
- `kei-proxy` resolves each reference through the runtime credential path:
  the same connector policy check and tenant-side secret resolution that
  credential release uses for governed connector calls. A denied or
  unresolvable reference means the command is not started, and `kei-proxy run`
  exits non-zero with a reason code.
- The resolved value is injected **only into the child process's
  environment** and masked in its stdout and stderr. The agent, the harness
  and the transcript only ever hold the reference; the agent never reads or
  stores the raw credential.
- Each run is audited with the connector ids and fields referenced, `argv0`,
  the args digest and the exit status, never the values.
- The `shell:` policy still decides whether the harness may run the command
  (`shell:git` here); the connector policy decides whether the credential may
  be used. Neither the policy, the bundle nor the rendered native config
  contains the secret.

Secrets are delivered to the runtime by `kei-proxy credential sync`; see the
`kei-proxy` and `kei-runtime-setup` skills.

## Report-only hook (HP-C6)

HP-C6 is the **report-only audit hook**, and it is implemented: `kei harness
sync` installs `kei-proxy hook <harness>` in Claude Code and Codex (hook
entries) and OpenCode (a Kei-owned plugin). **The hook never decides or
blocks: it only records.** It writes each tool call, the harness's native
decision and an args digest to the audit trail, always exits 0, and never
allows, denies or answers a permission prompt. For Claude Code the native decision is
observed from Claude Code's own events (see "Key facts" above and the
permissions model, section 4).

There is **no report-only enforcement mode**. Kei has no
`--policy-mode report-only` flag and no setting that logs policy violations
without enforcing them: rendered policies are always enforced natively by the
harness, and commands no policy matches fall through to the harness's own
permission mode. To see what a policy change would do before it takes effect,
preview with `kei harness sync --harness <kind> --dry-run`, or list the
policies (`kei policies list --workspace WS --json`) and check them by hand.
There is no `kei policies verify` command.

## How Kei manages harness permissions

For a full walkthrough of the permissions model — how Kei compiles policies
into native harness config, the audit-only hook, Kei-only permission management,
known limitations, and bug reporting — see
[`references/permissions-model.md`](references/permissions-model.md).

What the key facts above leave out:

- **The audit event.** The hook reports the tool name, phase, native decision
  and an HMAC args digest (args are encrypted to customer keys, never logged
  raw).
- **Claude Code event phases.** Besides `pre` and the `decision` event,
  `post` events carry an optional `failed` flag (the error text is never
  recorded), and an asked call gets a `permission_reply` (`approved` or
  `denied`). See the permissions model, section 4.
- **Making Kei the only source.** Preview with `kei harness sync --harness
  <kind> --dry-run`. Before it writes, sync saves the old file as
  `<file>.kei-backup-<timestamp>`. Run the real sync, then remove your own allow/deny entries
  by hand: sync never touches entries it did not write. Keep the harness in its
  default permission mode (usually `ask`), not allow-all, and run sync again.
  If something goes wrong, copy `<file>.kei-backup-<timestamp>` over the
  native config. Only one backup is kept, from before the latest successful
  sync, so restore before you sync again.
- **Bundle reuse.** The runtime reuses the current bundle while policies and
  harnesses are unchanged (up to 6 hours).

## Deny rendering and skipped denies

`kei harness sync` renders denies into the native deny list (Claude Code
`permissions.deny`, Codex `prefix_rule` with `decision="forbidden"`, OpenCode
`permission.bash` `deny`). Claude Code applies deny entries before allow
entries.

**Which sources render.** `*` renders on every harness and `harness:` on the
harness it names. `user:`, `email:` and `group:` render only when they name
the bundle **subject**: the installation owner's user ID, email and groups.
Only `kei.policy-bundle/v2` bundles carry a subject, so on v1 none of these
sources render. Sync then prints
`Claude Code: N user:/group: policies not rendered; the v1 policy bundle carries no subject (upgrade the catalog to serve v2)`.

**The skipped-deny rule.** A person-sourced deny that cannot render is
skipped, but it still comes first in precedence. So sync **withholds** each
lower-precedence permit whose destination overlaps it, prints one line for each,
and leaves the harness to ask. **A skipped deny never becomes an allow.**

| Priority | Source | Destination | Effect |
| ---: | --- | --- | --- |
| 100 | `group:admins` | `shell:git push --force` | deny |
| 10 | `*` | `shell:git` | permit |

| Bundle | Sync prints | Claude Code `permissions` | What the user sees |
| --- | --- | --- | --- |
| v1, or v2 without a subject, or v2 whose subject is not in `admins` | `not rendered in Claude Code: allow git (a higher-precedence user:/group: deny overlaps it; the harness will ask)` | no `git` entry | Claude Code **asks** before `git push --force` (and every other `git` command) |
| v2, subject in `admins` | no `not rendered` line | allow `Bash(git:*)`, deny `Bash(git push --force:*)` | Claude Code runs other `git` commands and **denies** `git push --force` natively |

The full captured `--dry-run` output for both cases is in
[`references/permissions-model.md`](references/permissions-model.md), under
"Skipped denies withhold overlapping permits".
A permit that does not overlap the skipped deny still renders. For example,
`*` `shell:git status` renders `Bash(git status:*)`.

A catch-all `shell:*` deny renders as `Bash(*)` and blocks every permitted
command. Scope denies to the prefix you mean.

## Realistic usage boundaries

- **No `/api/cli/*` routes.** The policies and harness commands go through the
  shared AIP `/api/v1` endpoints — `/api/v1/policies` and
  `/api/v1/runtime-installations/{installation}/harnesses` — following AIP
  conventions (ADR-019). There are no private CLI-backend endpoints.
- **A `harness:` source needs a harness destination.** The catalog rejects
  `harness:` with a connector, capability, resource or non-harness tool
  destination on save (`INVALID_ARGUMENT`).
- **A skipped deny never becomes an allow.** When a person-sourced deny cannot
  render, sync withholds the permits it overlaps and the harness asks; it does
  not render those permits as allows.
- **Policies are created by hand, never seeded — with two exceptions.**
  `web_search` and `search_wiki` tool permits are seeded when the workspace
  is created. A `pedro-discord` route pair (agent-bound permit + bind) is
  seeded when the pedro-discord agent is set up. Deleting the agent-bound
  permit does not stick until HAI-670 is fixed; the seed row reappears on
  the next bundle refresh. There is no `kei policies seed` or
  `--init-defaults` flag for other policies. The first non-seeded policy in a
  workspace is a conscious authoring act.
- **There is no report-only enforcement mode.** The report-only hook (HP-C6)
  only audits; it is not a way to log violations without enforcing them.
  Preview a change with `kei harness sync --dry-run` or by listing the
  policies (`kei policies list --workspace WS --json`).
- **Bash is only governed through `shell:` dst policies.** There is no
  `dst: bash:*` or `dst: sh:*`. The harness normalises the command to its
  first token, and only `shell:<prefix>` policies match (e.g. `shell:git`).
- **Native kinds are unique per installation; `custom` is not.** Each runtime
  installation (one `KEI_RUNTIME_TOKEN`) allows one harness per native kind
  (`claude_code`, `codex`, `opencode`). Desktop native kinds are auto-detected
  by `kei harness sync` — they are NOT registered with `kei harness add`.
  Multiple `custom` harnesses may be registered on the same installation.
- **`kei harness sync` rewrites the native config file in place.** It writes
  to the harness's native location for the matched kind, replacing only the
  entries its last run wrote and saving `<file>.kei-backup-<timestamp>` first.
  It keeps only that one backup per file; the next successful sync replaces it.
- **The hook does not decide.** Even when the report-only hook is active, the
  harness makes the allow/deny decision from its native config. Kei only
  observes. For Claude Code it records the outcome Claude Code reports (ran,
  asked, or neither); it never answers a permission prompt.
