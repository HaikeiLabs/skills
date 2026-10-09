Kei does **not** deny the command. It falls through to the harness's native permission mode:

- **Native harnesses** (Claude Code, Codex, OpenCode): falls through to their own built-in logic, usually **`ask`** (prompts the user). The command can still be allowed if the user already has an allow entry or if the mode is set to auto-accept. (*permissions-model.md:93-105*)
- **Custom harnesses & governed connectors**: **deny** (fail-closed). (*permissions-model.md:107-117*)

So for desktop coding agents, no match = gets prompted/asked, not silently denied.
