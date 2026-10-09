No, you don't run `kei harness add` manually for either — that command is for custom/SDK harnesses only. Desktop harnesses (Claude Code, Codex, OpenCode, Pi) use `kei harness sync` for auto-discovery instead.

**How the setup scripts handle having both on one machine:**

1. Both scripts source `setup-lib.sh`, which checks for an existing `~/.config/kei.yaml` first.
2. Run Claude Code's script first → it creates **one** runtime installation (named `claude_code@hostname`), writes `~/.config/kei.yaml`, registers the Claude Code harness, and syncs.
3. Run Codex's script second → it finds the existing `~/.config/kei.yaml`, the bootstrap succeeds (same machine, same credential), so it **skips creating a new installation** and reuses the existing one. It then registers Codex as a **second harness against the same installation** and syncs.

Result: **one runtime installation** (one `kei-proxy`, one credential) shared by both harnesses, each registered as a separate harness within it. The scripts also call `kei harness add` with `|| true` for backward compatibility, but for desktop kinds the primary path is `kei harness sync`.
