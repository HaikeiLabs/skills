Before running those commands, here's what to verify:

1. **The command names are `kei policies list` and `kei policies update`** (plural `policies`, not `policy`). The singular form doesn't exist.
2. **`kei` is installed** — run `kei --version` to confirm.
3. **Logged in** — both commands need `kei login` first (org owner/admin role required).
4. **Minimum version** — `kei policies list` crashes on kei ≤ 0.1.10 (decode error). Run `kei --version`; if ≤ 0.1.10, upgrade first.
5. **Workspace exists** — the `--workspace` flag takes a workspace name or ID. Use `kei workspaces list` to confirm it's available.

Want me to check your installed version and workspace list?
