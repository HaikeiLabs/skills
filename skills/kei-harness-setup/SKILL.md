---
name: kei-harness-setup
description: Connect a supported coding-agent harness — Claude Code, Codex, OpenCode, Pi, or Cursor — to Kei governance. Install Haikei skills, pair the harness with a runtime installation and kei-proxy, pass agent identity to each governed call, and verify that unbound calls are denied.
---

# Set up a harness with Kei

Kei governs a harness through this chain:

`harness adapter → kei-proxy → Kei policy and audit services`

The harness asks `kei-proxy` before each governed operation. `kei-proxy`
decides locally against the workspace policy bundle and runs allowed work
inside the tenant runtime. The catalog holds policy, connector metadata, and
redacted audit metadata only. Setting up a harness means installing the skills
that teach the agent this contract, then wiring the harness to a runtime.

This is a workflow skill. Keep the two Kei executables straight: **`kei`** is
the platform admin CLI a person runs once to set things up (`kei-cli` skill);
**`kei-proxy`** is the runtime the harness calls on every governed tool call
(`kei-proxy` skill). The agent itself only ever talks to `kei-proxy`. Load
**`kei-runtime-setup`** for the runtime half of the setup.

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
| Claude Code, Codex, OpenCode, Pi | Local coding adapter | This skill's main path |
| Cursor | Local coding adapter (skills only) | The skills repo ships a Cursor plugin; the console does not list a Cursor runtime adapter yet, so confirm before promising governed calls |

Any other harness is unsupported and is denied until an adapter is explicitly
registered. Do not improvise one.

## FIRST: find out which harness you are running in

Check the environment rather than assuming — the skills directory differs per
harness, and installing into the wrong one silently does nothing. Then check
whether the skills are already there (for example a `kei-cli` folder in the
harness's skills directory, or the harness's skill list) before installing
again.

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

For a coding harness on a workstation, the current path is:

```sh
kei login --api-url https://app.haikeilabs.com   # admin, once; a person approves in the browser
kei bot init --platform cli --name "my laptop"
kei bot credential --installation ID | <secret-manager import>
<secret-manager read> | kei setup --control-plane-url https://app.haikeilabs.com   # token via pipe → ~/.config/kei.yaml
kei runtime bootstrap     # runs the bundled kei-proxy to verify + heartbeat
kei bot bind --installation ID
```

At run time the harness process needs `KEI_RUNTIME_TOKEN` and
`KEI_RUNTIME_CONTROL_PLANE_URL` in its environment so the `kei-proxy` it
spawns for each call inherits them. Load them from the secret manager; do not
put the token in a harness config file in a repo.

## 3. Pass identity on every governed call

The adapter calls `kei-proxy authorize` before a governed tool runs and obeys
the result: exit code `0` means allowed; any non-zero exit (a deny, or an
error such as an unreachable control plane) means do not run the tool. The
full flag and env reference is in the `kei-proxy` skill. Identity and
delegation come from flags or environment:

```text
KEI_PROXY_FRAMEWORK=claude|codex|opencode|pi   # which harness
KEI_PROXY_AGENT_ID=<agent UUID from the console>
KEI_PROXY_INVOKING_SUBJECT=<the human who started the task>
KEI_PROXY_PARENT_SPAN / KEI_PROXY_DELEGATION_DEPTH   # when a subagent delegates
KEI_PROXY_REGISTRY=<tool → service registry path>
```

Keep the human who started the task as the invoking subject through every
subagent hop; it is what the audit trail attributes the call to. Never put a
tenant, org, or workspace ID in agent-controlled tool parameters — scope comes
from the runtime token.

## 4. Register tools and bind connectors (console)

Register harness tools and bind connectors and capabilities using the
currently documented platform workflow. A tool is not allowed just because
the adapter exposes it; tools like `search_wiki` and `web_search` are
policy-governed too.

## 5. Prove it fails closed

Run one permitted, disposable call and one deliberately unbound call:

```sh
kei-proxy authorize --user TEST_USER_ID --tool github.create_pr \
  --action github:write --resource repo:acme/widgets; echo "exit=$?"
```

The unbound call must be denied without any provider call and produce only
redacted audit metadata. Missing bindings, an unregistered harness, invalid
installation scope, stale policy, and no matching policy must all be **DENY**.
The harness is not set up until you have seen a denial.

## Validation commands

```sh
ls "$SKILLS_DIR" | grep '^kei'                          # skills installed
head -3 "$SKILLS_DIR/kei-cli/SKILL.md"                  # frontmatter starts with ---
kei-proxy runtime bootstrap | jq '.workspace_id'        # runtime scoped to a workspace
kei-proxy authorize --user U --tool T --action A --resource R; echo $?
```

## Realistic usage boundaries

- Do not paste runtime tokens or `kh_live_…` agent keys into harness config
  files in a repo, or into the conversation.
- Installing skills changes what the agent knows, not what it may do. Policy in
  the workspace decides that.
- Agents are created and keyed in the console; there is no CLI command for
  either yet.
- The explicit Harness resource, installation-claim handshake, and short-lived
  runtime identity in the ADRs are planned. Do not present them as available.
