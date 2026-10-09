---
name: kei-harness-policy
description: "Govern harness command execution through Kei policies — import native allow/deny rules from Claude Code, Codex, or OpenCode into Kei policy bundles; create/update/delete shell:/skill:/path: policies; register custom/SDK agent-keyed harnesses and sync tool registrations; credential injection via kei:// references. Use when running `kei policies list|get|create|update|delete|import` or `kei harness add|sync|list|remove`. Covers ADR-029 harness-command-policy (3NF harness resource keyed by agent; kinds claude_code|codex|opencode|custom), ADR-028 kei.match/v1, HP-C1 rev1 policy API shape, HP-C3 harness adapter/tool discovery, HP-C5 bundle trust, HP-C6 report-only hook, and credential resolution for shell: dst commands."
---

# Harness command policy

Kei governs a coding-agent harness in two layers:

1. **Tool-call policy** — the standard Kei ABAC path: agent tool calls go
   through `kei-proxy authorize`, the runtime PDP decides from the bundle
   (ADR-026, ADR-028).
2. **Harness command policy** — the harness's native terminal/command execution
   layer (e.g. Claude Code's bash tool, Codex's shell, OpenCode's permission
   system). The harness decides natively from a config file rendered by
   `kei harness sync`; Kei does not intercept each command. A lightweight
   report-only hook (HP-C6) can send decisions to the audit trail without
   blocking.

This skill owns layer 2: translating between what the Kei control plane
understands (`dst: shell:git`, `dst: skill:kei-agents`) and what each harness
understands natively (Claude Code `permissions.allow`, Codex `prefix_rule`,
OpenCode `permission.bash`).

## Concepts

| Term | Meaning |
| --- | --- |
| **Harness command policy** | A Kei ABAC policy whose `dst` follows the `shell:`, `skill:`, or `path:` scheme — governs what commands and skills a harness agent may run on the host without asking (ADR-029 §2). |
| **`shell:` dst** | A command prefix the harness may run without asking. `shell:git` permits any `git` invocation; `shell:herdr` permits herdr commands. |
| **`skill:` dst** | A skill name the harness may load without asking. `skill:kei-agents` permits the Kei agents skill. |
| **`path:` dst** | A filesystem path prefix the harness may read or write without asking. `path:/workspace/project` permits access under that directory. |
| **`kei.harness-match/v1`** | The match dialect for harness command policies. Same matching rules as `kei.match/v1` (ADR-028 §5) but with the harness-specific dst candidates above. A policy never combines `shell:`, `skill:`, and `path:` in one dst — write separate policies. |
| **Native config** | Each harness's own allow/deny list: Claude Code `~/.claude/settings.json` → `permissions.allow`, Codex `~/.codex/rules/default.rules` → `prefix_rule`, OpenCode `opencode.json` → `permission.bash`. |
| **Report-only hook** | An optional `kei-proxy` sidecar that receives command-execution events and writes them to the audit trail but never blocks execution (HP-C6, ADR-029 §4.2). Implementation is a separate follow-up (HAI-{followup}); this skill describes the config shape. |
| **`kei harness add`** | Register a custom/SDK harness type (`--kind custom`) so its tools are known to the control plane. Desktop harnesses (claude_code, codex, opencode) are auto-detected by sync — do NOT use `add` for them. `--installation` and `--agent` are optional with defaults (single installation, default agent). |
| **`kei harness sync`** | Fetch the policy bundle and render it into the harness's native config format (Claude Code `permissions.allow`, Codex `prefix_rule`, OpenCode `permission.bash`). Auto-discovers desktop harnesses (claude_code, codex, opencode) from the registered runtime installation — no separate `add` needed. |

## Retrieval sources

| Source | How to retrieve | Use for |
| --- | --- | --- |
| Installed binary | `kei help`, `kei policies --help`, `kei harness --help` | Exact subcommands, flags, and allowed values for the installed version |
| Policy contract | `docs/contracts/policy-set-v1.schema.json`, `docs/contracts/policy-bundle-v1.schema.json` | The JSON schema a policy must satisfy |
| Harness docs | The harness's own skills documentation | How a particular harness loads native config (Claude Code's `settings.json`, Codex's `default.rules`, OpenCode's `opencode.json`) |
| ADR-029 | `docs/adr/029-harness-command-policy.md` | Design rationale, shell:/skill:/path: schemes, report-only hook, match dialect |
| Bundle versioning | [`references/bundle-versioning.md`](references/bundle-versioning.md) | Bundle identity fields (bundle_id, bundle_version, policy_revision), lifecycle, polling/refresh, rollback protection, state machine, troubleshooting |

When this skill and `kei help` disagree, **trust `kei help`** and mention the
difference to the user.

## FIRST: check version

```sh
kei --version          # needs > 0.1.6 for policies and harness subcommands
```

`kei policies` and `kei harness` ship in kei > v0.1.6. If the installed version
predates it, fall back to the Kei API (`kei-api` skill) or the web console for
policy management.

## Quick reference

| Task | Command | Needs login |
| --- | --- | --- |
| List policies for a workspace | `kei policies list [--workspace WS] [--page-size N] [--json]` | yes |
| Get a policy | `kei policies get ID [--workspace WS] [--json]` | yes |
| Create a shell:/skill:/path: policy | `kei policies create --name NAME --src-pattern PATTERN --dst-pattern DST --effect permit\|deny [--priority N] [--agent-id ID]` | yes |
| Update a policy | `kei policies update ID [--name N] [--src-pattern P] [--dst-pattern D] [--effect permit\|deny] [--priority N] [--enabled]` | yes |
| Delete a policy | `kei policies delete ID --yes [--workspace WS]` | yes |
| Import native harness rules | `kei policies import --from claude\|codex\|opencode [--file PATH] [--src PATTERN] [--out FILE] [--apply] [--workspace WS]` | yes |
| Register a custom/SDK harness | `kei harness add --kind custom [--installation ID] [--agent ID]` | yes |
| Sync tool registrations | `kei harness sync [--harness KIND] [--dry-run]` | yes |
| List registered harnesses | `kei harness list --installation ID [--json]` | yes |
| Remove a harness | `kei harness remove AGENT_ID --installation ID` | yes |

All `policies` and `harness` commands accept `--api-url URL` to override the
default control-plane URL.

## When to use `kei harness add`

`kei harness add` registers a harness kind so the control plane knows which
native config format to render. It is **only for custom/SDK harnesses**
(`--kind custom`).

**Desktop coding harnesses (Claude Code, Codex, OpenCode, Pi) are sessions**
of one runtime installation per machine. They are auto-discovered by
`kei harness sync` — you do NOT need to run `kei harness add` for them.
Installing Codex next to Claude Code on the same machine? Just run
`kei harness sync`; both are detected from the same installation.

| Use case | Command |
|---|---|
| You built a custom SDK harness | `kei harness add --kind custom [--installation ID] [--agent ID]` |
| Claude Code / Codex / OpenCode / Pi on a workstation | `kei harness sync` (no `add` needed) |

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

Credentials for `shell:` dst commands use `kei://` references (see "Credential
injection for shell: dst commands" below).

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

In a harness command policy, **src-pattern** is the **subject** — which harness,
group, or user this policy applies to. **dst-pattern** is the **command prefix**
the policy governs.

| Field | What it identifies | Examples |
| --- | --- | --- |
| src-pattern | Subject — harness kind, group, user, or `*` for any | `harness:claude_code`, `harness:opencode`, `group:developers`, `user:alice@corp.com`, `*` |
| dst-pattern | Command prefix after shell normalization | `shell:git`, `shell:herdr`, `shell:rm`, `skill:kei-agents`, `path:/workspace` |

A policy's src and dst are independent: `src=harness:opencode dst=shell:git`
means "for the OpenCode harness, permit/deny git commands".

### Examples

**Allow git + deny curl for OpenCode:**

```sh
# 1. Permit git commands from the OpenCode harness
kei policies create \
  --name "allow git" \
  --src-pattern "harness:opencode" \
  --dst-pattern "shell:git" \
  --effect permit \
  --priority 100

# 2. Deny curl commands from the OpenCode harness
kei policies create \
  --name "deny curl" \
  --src-pattern "harness:opencode" \
  --dst-pattern "shell:curl" \
  --effect deny \
  --priority 100
```

At equal priority a deny beats a permit (ADR-028 §2), so `deny curl` would
override any broad permit covering curl — but since `shell:curl` and
`shell:git` are distinct dst schemes, no conflict occurs here. After creating
the policies, run `kei harness sync` to render them into the native harness
config.

**Allow git for any harness (`*` src):**

```sh
# Permit git for any harness connected to this installation
kei policies create \
  --name "allow git" \
  --src-pattern "*" \
  --dst-pattern "shell:git" \
  --effect permit \
  --priority 100
```

**Targeted deny — block `rm -rf` for a group:**

```sh
# Deny dangerous rm -rf for the developers group
kei policies create \
  --name "deny rm -rf" \
  --src-pattern "group:developers" \
  --dst-pattern "shell:rm -rf" \
  --effect deny \
  --priority 200
```

## Importing from native harness config

Each coding harness has a different native format. `kei policies import` reads
the harness's native config and creates one Kei policy per entry. The `--from`
flag selects the harness format (and its default source location):

| Harness | Native location | `--from` value | Translation |
| --- | --- | --- | --- |
| Claude Code | `~/.claude/settings.json` → `permissions.allow` | `claude` | Each array entry becomes a `shell:<entry>` permit at priority 100 |
| Codex | `~/.codex/rules/default.rules` → `prefix_rule` | `codex` | Each `prefix_rule` entry becomes a `shell:<prefix>` permit at priority 100 |
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

There is no `kei policies export` command. The native config file is rendered by
`kei harness sync`, which reads the current policy bundle and writes the
harness's native config (Claude Code `permissions.allow`, Codex `prefix_rule`,
OpenCode `permission.bash`). Only `shell:` policies have a native equivalent;
`skill:` and `path:` policies are governance-only. See "Registering a harness
and syncing tools" below.

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
  `ask`). Do not add a catch-all `shell:* deny` — it would be rendered into
  Claude Code `permissions.deny`, where deny beats allow and blocks every
  permitted command too (see "Deny rendering" below).

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
config file. Note: because the current renderer reformats the entire file, the
diff may be large (every line shown as changed) even when only one entry differs.
This will improve once an incremental diff renderer is deployed. Run sync after
installing new Haikei skills or after a policy change. Requires `kei` > v0.1.6
for `sync`.

## Bundle renewal

Policy bundles carry a `not_after` expiry (ADR-026 §4). When a bundle expires,
`kei-proxy` denies every governed call with `reason_code: policy_bundle_expired`.
The harness command policies in the bundle expire at the same time — the
harness's native config falls back to its own permission mode (usually `ask`
for native harnesses) until the bundle is renewed.

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
2. Run `kei-proxy policy sync` (or `kei-proxy runtime bootstrap`) to force an
   immediate bundle fetch.
3. Run `kei harness sync --harness KIND` to re-render native config from the
   fresh bundle.

For diagnosis of a stale or expired bundle, see the `kei-setup-doctor` skill.

## Credential injection for shell: dst commands

When a harness command policy with a `shell:` dst scheme needs a credential
(e.g. a GitHub token for `git push`), Kei resolves it through `kei-proxy`, not
by embedding the secret in the policy:

- The policy uses a `kei://` reference (e.g. `kei://workspace/credential/github-token`)
  to declare the credential dependency. The reference syntax is
  `kei://workspace/credential/<credential-name>` for workspace-scoped
  credentials or `kei://installation/credential/<name>` for installation-scoped
  ones.
- At run time, `kei-proxy` resolves the reference by looking up the named
  credential from the Kei control plane and injects the resolved value into
  the agent's environment before the command executes — the agent never reads
  or stores the raw credential value.
- The harness command policy author only needs to include the `kei://` reference;
  the actual secret value is never part of the policy definition, the bundle, or
  the rendered native config.
- This follows the same pattern as governed connector calls: `connector invoke`
  uses the identical `kei://` reference mechanism for data-source credentials
  (see the `kei-api` skill for creating and managing credentials).

**Example:** To let an agent run `git push` with a GitHub token, the policy dst
is `shell:git` and the credential reference is declared as
`kei://workspace/credential/github-token`. When the harness runs `git push`,
kei-proxy injects `GITHUB_TOKEN=gho_***` into the environment — neither the
policy JSON nor the native config ever contain the token value.

## Report-only hook (HP-C6)

The report-only hook is a **proposed** design (HP-C6 in ADR-029 §4.2). It would
be an **optional** `kei-proxy` sidecar that intercepts command-execution events
(the harness ran `shell:git push`) and writes an audit record without blocking
the command. The design envisions a `--policy-mode report-only` flag on
`kei-proxy` that makes `authorize` return ALLOW with an annotation instead of
DENY, while still auditing every violation.

In the current generation, harness command policies are decided natively by the
harness. The report-only hook is **not implemented** — do not configure it in a
production harness until the follow-up (HAI-{followup}) ships. As a workaround,
list the policies (`kei policies list --workspace WS --json`) and check by hand
which commands would be denied before deploying.

## How Kei manages harness permissions

For a full walkthrough of the permissions model — how Kei compiles policies
into native harness config, the audit-only hook, Kei-only permission management,
known limitations, and bug reporting — see
[`references/permissions-model.md`](references/permissions-model.md).

Key points to keep in mind:

- **`kei harness sync` renders the bundle** into native config (Claude Code
  `permissions.allow`, Codex `prefix_rule`, OpenCode `permission.bash`). Only
  `shell:` policies have a native equivalent; `skill:` and `path:` policies are
  governance-only.
- **The Kei hook is audit-only** — it reports the tool name, phase, native
  decision, and an HMAC args digest (args are encrypted to customer keys,
  never logged raw); it always exits 0 and never blocks or decides.
- **Unmatched commands fall through** to the harness's own entries and permission
  mode (usually `ask`). The command can still be allowed if your own settings
  permit it. Custom harnesses and connectors deny by default (fail-closed).
- **Sync is manual** — run `kei harness sync` after every policy change. The
  runtime reuses the current bundle while policies and harnesses are unchanged
  (up to 6 hours).

## Deny rendering

Deny policies (`effect: deny`) are **not yet written** to the harness's native
deny list (Claude Code `permissions.deny`, Codex `blocked_prefixes`). The
renderer only writes `permit` entries. This is tracked in HAI-400 (renderer PR).

Until HAI-400 ships, a `deny` policy's effect depends on how the harness
processes the rendered native config:

| Deny policy effect | What actually happens |
|---|---|
| A **permitted** command that is also covered by a deny | **Allowed** — the deny is invisible to the harness, so the permit wins |
| A **denied** command that has no permit | Falls through to the harness's native permission mode (usually `ask`) — it is **not blocked** by Kei |

This is why a catch-all `shell:* deny` is **harmful**: the renderer would write
`*` into `permissions.deny`, and Claude Code's deny-beats-allow semantics would
then block every permitted command too. Until the renderer supports deny
entries, keep a tightly scoped set of permit policies and rely on the harness's
native `ask` mode for everything else.

## Validation commands

## Realistic usage boundaries

- **`kei policies` and `kei harness` are not released.** They ship in kei
  > v0.1.6. If the installed version predates that, use the web console or the
  Kei API (`kei-api` skill) for policy management.
- **No `/api/cli/*` routes.** The policies and harness commands go through the
  shared AIP `/api/v1` endpoints — `/api/v1/policies` and
  `/api/v1/runtime-installations/{installation}/harnesses` — following AIP
  conventions (ADR-019). There are no private CLI-backend endpoints.
- **Policies are created by hand, never seeded.** There is no `kei policies
  seed` or `--init-defaults` flag. The first policy in a workspace is a
  conscious authoring act.
- **Report-only hook is not implemented.** It is a proposed design (HP-C6).
  Do not configure it in a production harness until the follow-up ships.
  List the policies (`kei policies list --workspace WS --json`) and check by
  hand to preview denials instead.
- **Bash is only governed through `shell:` dst policies.** There is no
  `dst: bash:*` or `dst: sh:*`. The harness normalises the command to its
  first token, and only `shell:<prefix>` policies match (e.g. `shell:git`).
- **Native kinds are unique per installation; `custom` is not.** Each runtime
  installation (one `KEI_RUNTIME_TOKEN`) allows one harness per native kind
  (`claude_code`, `codex`, `opencode`). Desktop native kinds are auto-detected
  by `kei harness sync` — they are NOT registered with `kei harness add`.
  Multiple `custom` harnesses may be registered on the same installation.
- **`kei harness sync` overwrites the native config file.** It writes the
  rendered config to the harness's native location for the matched kind. Back
  up the existing file before the first sync.
- **The hook does not decide.** Even when the report-only hook is active, the
  harness makes the allow/deny decision from its native config. Kei only
  observes.
