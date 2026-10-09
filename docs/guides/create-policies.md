# How to create policies

A policy says who may do what, and whether that is permitted or denied. This
guide covers the fields of a policy, how Kei orders policies that overlap,
which sources and destinations to use, how to write a policy, and what
`kei harness sync` writes into Claude Code, Codex and OpenCode. It ends with a
worked example, with real output, of a deny that cannot be rendered.

Kei does not seed policies. A new workspace starts with none. You write the
first policy yourself, in the console or with the `kei` CLI.

## Anatomy of a policy

| Field | What it holds | Example |
| --- | --- | --- |
| `src` | Who the policy applies to | `group:admins`, `user:<id>`, `agent:<id>`, `*` |
| `dst` | What it matches | `shell:git push --force`, `tool:search_wiki` |
| `effect` | `permit` or `deny` | `deny` |
| `priority` | An integer. A higher number decides first | `100` |
| `enabled` | Whether the policy takes part in decisions | `true` |

## Precedence

When several enabled policies match a request, Kei puts them in order, and
the first one decides:

1. Priority, highest first.
2. At equal priority, `deny` before `permit`.
3. Policy ID, ascending.

What happens when no policy matches depends on where the request is decided:

- **At run time** (`kei-proxy authorize`, for custom harnesses and connector
  operations), the request fails closed with a `deny`.
- **In a desktop harness** (Claude Code, Codex, OpenCode), there is no
  rendered rule for the command. The harness makes its own native decision,
  usually **ask**.

## Sources

- **Use people and agents first.** `user:<id>`, `group:<name>`,
  `agent:<id>`, and `*` (everyone in the workspace) are the normal sources.
  They apply whichever harness the person or agent is using.
- **`harness:<kind>` or `harness:<id>` is optional and narrower.** Use it only
  for a rule that differs by harness, such as "Codex may never run `rm`". It
  applies to everyone on that harness, not to a person. A `harness:` source is
  only valid with a harness destination: `shell:`, `skill:`, `path:`, `mcp:`,
  or a harness tool name such as `tool:claude_code.edit`. If you save a
  `harness:` source with a connector, capability, resource, or other tool
  destination, the save is rejected with `INVALID_ARGUMENT`.
- **`agent:<id>` with an exact tool or capability is checked at call time.**
  The policy matches when its source matches **either** the user **or** the
  calling agent. So a broad agent permit can grant more than a user's
  narrower rules allow. To cap it, add a deny with a higher priority for the
  operation you want to exclude:

  | Source | Destination | Effect | Priority |
  | --- | --- | --- | ---: |
  | `agent:agent-123` | `shell:git push --force` | deny | 60 |
  | `agent:agent-123` | `shell:git` | permit | 50 |

  An `agent:` source with a harness destination (`shell:`, `skill:`, `path:`,
  `mcp:`) stays a harness command policy, and `kei harness sync` renders it.

## Destinations

| Destination | Matches |
| --- | --- |
| `shell:<prefix>` | A whole-token argv prefix. `shell:git` matches `git push`, not `gitx` |
| `skill:<name>` | One skill, by exact name |
| `path:<glob>` | An absolute path glob, such as `path:/repo/**` |
| `mcp:<server>/<tool>` | An MCP server tool |
| `tool:<name>` | One exact tool-call name. Wildcards are not allowed |
| `capability:<name>` | One exact capability, such as `capability:pull_request.read` |
| All tools on a connector | A policy that names only the connector (`selector_v2` with `connector_id` and nothing else). It covers every tool bound to that connector, including tools added later. A higher-priority deny on one tool still carves that tool out. A connector-wide policy cannot select resources |

## Write the policy

**Console.** Open **Policies**. Use **Create agent command policy** for
shell commands, skills and file paths, and **Create Policy** for tool calls
and connectors. Pick **Who** and **What**, then set **Effect**. **Priority**
is under **Advanced**. For a connector-wide grant, choose a connection and
check **All tools on this connector**.

**CLI.**

```sh
kei policies create --name "admins: deny git push --force" \
  --src-pattern "group:admins" --dst-pattern "shell:git push --force" \
  --effect deny --priority 100

kei policies create --name "allow git" \
  --src-pattern "*" --dst-pattern "shell:git" \
  --effect permit --priority 10
```

`kei policies import --from claude` (or `codex`, `opencode`) reads a
harness's existing allow list. By default it only prints the policies it
would create. Add `--apply` to create them.

After every change, run `kei harness sync`. Run it with `--dry-run` first.

## What renders into a desktop harness

`kei harness sync` writes `shell:` policies into each harness's native
settings: Claude Code `~/.claude/settings.json`, Codex `~/.codex/rules/kei.rules`
and OpenCode `opencode.json`. Permits go to the allow list and denies go to
the deny list. Claude Code and OpenCode also take `skill:` policies, and
OpenCode takes `path:` policies. Codex takes only argv prefix rules, and sync
prints a `not enforceable in Codex` line for each policy it cannot express.

Which sources render:

- A `*` source renders on every harness.
- A `harness:` source renders on the harness it names.
- A `user:`, `email:` or `group:` source renders only when it names the
  bundle's **subject**. The subject is the person who owns the runtime
  installation: their user ID, email and groups. Current
  (`kei.policy-bundle/v2`) bundles carry it. The older v1 bundles do not, so
  on v1 none of these sources render, and sync prints a line saying so.

### Worked example: a deny that cannot render

| Priority | Source | Destination | Effect |
| ---: | --- | --- | --- |
| 100 | `group:admins` | `shell:git push --force` | deny |
| 10 | `*` | `shell:git` | permit |

The deny cannot render when the bundle is v1, when it is v2 without a
subject, or when the subject is not in `admins`. In all three cases sync
skips the deny. Rendering the permit on its own would let
`git push --force` run without asking, which is more than the policies grant.
So sync **withholds the permit** too, prints one line for each withheld
permit, and leaves the harness to ask. **A skipped deny never becomes an
allow.**

The output below was captured from `kei` built from kei-cli main, run against
a local fixture bundle in a sandboxed home directory, with this
`~/.claude/settings.json` before the sync:

```json
{
  "permissions": {
    "allow": [
      "Bash(npm test)"
    ]
  }
}
```

**v2 bundle with no subject:**

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
     … (26 lines: the report-only kei-proxy hook)
```

**v1 bundle:** the same `not rendered` line, plus one more:

```text
Claude Code: 1 user:/group: policies not rendered; the v1 policy bundle carries no subject (upgrade the catalog to serve v2)
```

After the sync, `permissions` in `~/.claude/settings.json` is unchanged:

```json
"permissions": {
  "allow": [
    "Bash(npm test)"
  ]
}
```

What you see: there is no `git` entry, so Claude Code **asks** before it runs
`git push --force`, and before every other `git` command. A v2 bundle whose
subject is not in `admins` gives the same result and prints the same
`not rendered` line.

**v2 bundle whose subject is in `admins`:** sync prints no `not rendered`
line, and both policies render:

```text
$ kei harness sync --harness claude_code --dry-run
~/.claude/settings.json: +31  -1   (Kei-managed entries updated)
--- ~/.claude/settings.json
+++ ~/.claude/settings.json (Kei render)
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

After the sync:

```json
"permissions": {
  "allow": [
    "Bash(npm test)",
    "Bash(git:*)"
  ],
  "deny": [
    "Bash(git push --force:*)"
  ]
}
```

What you see: Claude Code runs other `git` commands without asking and
**denies** `git push --force` natively. In Claude Code, deny entries beat
allow entries.

Codex and OpenCode behave the same way: the permit is withheld when the deny
is skipped, and both entries render when the subject matches.

**Keeping common commands prompt-free.** A permit that does not overlap the
skipped deny still renders. If you add `*` `shell:git status` at priority 10,
sync renders `Bash(git status:*)`, so `git status` runs without asking while
`git push --force` still asks.

## Checklist

- Start from people and agents. Use `harness:` only for a per-harness
  difference.
- Give each rule a distinct priority, with guardrail denies highest.
- Cap broad `agent:` permits with a higher-priority deny.
- Run `kei harness sync --dry-run` and read every `not rendered` line before
  you sync.
