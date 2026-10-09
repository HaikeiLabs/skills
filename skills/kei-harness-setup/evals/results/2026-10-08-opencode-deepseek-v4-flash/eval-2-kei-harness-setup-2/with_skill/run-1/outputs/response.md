Two paths:

**Plugin install (simplest):** In each harness run the plugin command:

```
# Claude Code
/plugin marketplace add HaikeiLabs/skills
/plugin install haikei@haikei

# Codex
codex plugin marketplace add HaikeiLabs/skills
codex plugin add haikei@haikei
```

Then pair each with a runtime (`kei login → kei bot init → kei bot credential | kei setup → kei runtime bootstrap`) and sync: `kei harness sync --harness claude_code` (or `--harness codex`).

**Clone + link** if plugin flows aren't available — symlink `HaikeiLabs/skills` into `~/.claude/skills/` and `~/.agents/skills/` (or `~/.codex/skills/` for older Codex).

Prove it works by running `kei-proxy authorize` with a permitted tool (exit 0) and an unbound tool (non-zero). Until you see a **denial**, governed calls aren't actually going through Kei.
