The first thing to check is your `permission` rules. Look in these config files for a broad deny:
This is a config-less eval sandbox, so there are no files to inspect here. But here's the short answer:

**First check `permission` in your `opencode.json`** (both project-level and `~/.config/opencode/opencode.json`). Look for:

1. **`"permission": "deny"`** (a string, not an object) — this is shorthand for "deny everything".
2. **`"*": "deny"`** as a catch-all rule in a per-tool object (e.g., `"bash": { "*": "deny" }`).
3. **Per-agent override** — an agent config (inline or `.opencode/agent/*.md`) with `permission: { ... }` that denies tools.
4. **Rule order** — insertion order matters in permission objects. opencode evaluates the **last** matching rule, so `{ "git *": "allow", "*": "deny" }` denies everything (the `"*": "deny"` is last). If you meant the opposite, swap the order.

To isolate: launch with `OPENCODE_DISABLE_PROJECT_CONFIG=1` to skip project-level config and see if tools work again. If they do, the project config has the offending rule.
