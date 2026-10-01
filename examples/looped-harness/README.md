# Looped harness example: herdr orchestrator + wiki + policy

A **looped harness** is a self-driving agent workflow that dispatches worker agents in parallel, monitors them, re-plans on failures, and hands back reviewable stacked PRs — all driven by one orchestrator agent in a loop.

This directory shows one concrete loop: **herdr-orchestrator** (the orchestrator skill), **herdr-wiki-plugin** (shared durable memory), and a **harness command policy** that governs which shell commands each harness may run without asking.

## How the loop works

```
Orchestrator pane (herdr-orchestrator skill)
    │
    ├─ 1. Understand: wiki search + codebase search
    ├─ 2. Plan: decompose goal into tasks, assign workers
    ├─ 3. Dispatch: herdr agent start + prompt per worker
    ├─ 4. Watch: watch-workers.sh → SETTLED / BLOCKED / STALL
    ├─ 5. Verify: re-run tests, check PRs
    ├─ 6. Re-plan: update wiki, dispatch next phase
    └─ 7. Report: stack URLs, e2e results, blockers
               │
Worker panes ──┘  each in its own herdr pane, own worktree
    │
    └─ herdr agent (codex / claude / opencode)
         │
         └─ wiki (shared memory: decisions, contracts, blockers, handoffs)
```

The orchestrator never writes code. It manages worker scaffolds (briefs, context, environment) and the task graph. Workers deliver PRs. The wiki (`herdr-wiki-plugin`) is the durable memory that survives agent sessions — decisions, interface contracts, blockers, handoffs.

## Prerequisites

- **herdr** — terminal multiplexer for agent panes. Install from `https://github.com/Soypete/herdr`.
- **herdr-wiki-plugin** — provides both the wiki CLI (`wiki search`, `wiki capture`, ...) and the `herdr-orchestrator` skill. Install from `https://github.com/Soypete/herdr-wiki-plugin`.
- **Haikei skills** — the Kei governance skills for your harnesses (optional, only needed if using the policy example). Install from `https://github.com/HaikeiLabs/skills`.

## Install

### 1. Install herdr-wiki-plugin (wiki + herdr-orchestrator)

The plugin ships both the wiki tool and the herdr-orchestrator skill:

```sh
herdr plugin install https://github.com/Soypete/herdr-wiki-plugin
```

Verify: `wiki stats` returns page and inbox counts.

### 2. Install the herdr-orchestrator skill per harness

Link or copy the skill from the plugin into your harness's skills directory:

**Claude Code:**
```sh
ln -s ~/.herdr/plugins/herdr-wiki-plugin/skills/herdr-orchestrator ~/.claude/skills/herdr-orchestrator
```

**Codex:**
```sh
ln -s ~/.herdr/plugins/herdr-wiki-plugin/skills/herdr-orchestrator ~/.agents/skills/herdr-orchestrator
```

**OpenCode / Pi:**
```sh
ln -s ~/.herdr/plugins/herdr-wiki-plugin/skills/herdr-orchestrator ~/.config/opencode/skills/herdr-orchestrator
```

The orchestrator skill expects the wiki CLI to be on `PATH` (installed by the plugin in step 1).

### 3. Apply the sample policy (optional)

The entries in `policy/harness-commands.example.json` permit common loop commands (herdr, wiki, gh stack, git worktree). If you use Kei governance, create each entry via the CLI or web UI:

```sh
# Create one policy per entry (repeat for each permit/deny rule)
kei policies create \
  --name "allow herdr orchestration" \
  --src "*" \
  --dst "shell:herdr" \
  --effect permit \
  --priority 100
```

If you don't use Kei, add equivalent allow rules in your harness's native config:

- **Claude Code:** `~/.claude/settings.json` → `permissions.allow`
- **Codex:** `~/.codex/rules/default.rules` → `prefix_rule`
- **OpenCode:** `opencode.json` → `permission.bash`

## Usage

1. Open an orchestrator pane in herdr.
2. The herdr-orchestrator skill auto-loads and guides you through the loop: understand → plan → dispatch → watch → verify → re-plan → report.
3. Workers use the wiki skill for shared memory (`wiki search`, `wiki capture`).

## Repo structure

```
examples/looped-harness/
  README.md                             # this file
  policy/
    harness-commands.example.json       # sample harness command policy
```

The herdr-orchestrator skill and herdr-wiki-plugin live at [Soypete/herdr-wiki-plugin](https://github.com/Soypete/herdr-wiki-plugin).

## License

Same as the HaikeiLabs/skills repo.
