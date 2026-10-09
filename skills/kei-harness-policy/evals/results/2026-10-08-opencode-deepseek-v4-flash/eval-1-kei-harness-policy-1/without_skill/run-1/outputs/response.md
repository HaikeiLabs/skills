I don't know of any built-in `import` command in opencode for this. The migration would be a manual mapping from Claude Code's `settings.json` → opencode's `permission` field in `opencode.json` (or an agent frontmatter). Here's what I can tell you conceptually:

**Claude Code** (`~/.claude/settings.json` or `.claude/settings.json`):
```json
{
  "permissions": {
    "allow": [
      "Bash: npm run build",
      "Read: src/**",
      "Edit: src/**"
    ]
  }
}
```

**opencode** uses a `permission` field with action-based patterns:
```json
{
  "permission": {
    "bash": { "npm run build": "allow", "*": "ask" },
    "read": { "src/**": "allow", "*": "ask" },
    "edit": { "src/**": "allow", "*": "ask" }
  }
}
```

**Things to be careful about:**

1. **Pattern semantics differ** — Claude Code's `permissions.allow` entries are tool-prefixed strings (`Bash: <command>`), while opencode uses per-tool objects with glob patterns. You'd need to parse the prefix and strip it.
2. **No wildcard assumptions** — Claude Code may auto-allow broad patterns; opencode requires explicit patterns per tool. Don't just set `"permission": "allow"` (that opens everything).
3. **Last-match-wins** — opencode evaluates rules bottom-up. Put broad patterns first, narrow exceptions last.
4. **Per-agent vs. top-level** — Claude Code permissions are global; you may want to scope rules to specific agents using agent-level `permission:` frontmatter instead of the top-level field.
5. **Insertion order matters** — opencode uses the *last* matching rule, so the order of patterns within `{ pattern: action }` matters, unlike Claude Code's allowlist semantics.
6. **No `Deny` concept in Claude Code's allowlist** — Claude Code's `permissions.allow` is purely a list of auto-approved items; opencode supports explicit `deny` rules which you may want to add manually.

If there were a script or plugin for this, it'd need to parse Claude Code's `Tool: pattern` format and emit opencode's `tool: { pattern: action }` structure, but I'm not aware of one existing.
