Safe sequence (workspaces are managed in the web app — `kei` has no `create workspace` command):

```sh
# 1. Authenticate (admin only)
kei login

# 2. Create the runtime installation for a local coding harness
kei bot init --platform cli --name "my-coding-harness"

# 3. Pipe the credential into your secret manager (never printed to terminal)
kei bot credential --installation <ID> --workspace <workspace-name> | \
  <your-secret-manager import>

# 4. Check status
kei bot status --installation <ID>
```

- Workspaces are created/managed at `app.haikeilabs.com` — no CLI command exists.
- `kei bot init` returns the installation ID; the credential is only emitted once.
- After setup, optionally run `kei setup` + `kei runtime bootstrap` for local runtime config.
