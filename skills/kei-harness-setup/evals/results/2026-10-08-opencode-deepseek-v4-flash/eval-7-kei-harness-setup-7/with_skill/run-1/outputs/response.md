Here's the full walkthrough for setting up Claude Code with Kei on a fresh macOS machine.

---

### 1. Install the Kei CLI + proxy

```sh
curl -fsSL https://kei-cli-releases.s3.us-east-1.amazonaws.com/kei-cli/install.sh | bash -s -- -d ~/.local/bin
```

Then add `~/.local/bin` to your `PATH` (e.g., in `~/.zshrc`).

### 2. Clone the Haikei skills (so Claude Code knows Kei)

```sh
git clone https://github.com/HaikeiLabs/skills.git ~/src/haikei-skills
mkdir -p ~/.claude/skills
for d in ~/src/haikei-skills/skills/*/; do
  name=$(basename "$d")
  dest="$HOME/.claude/skills/$name"
  [ -e "$dest" ] && echo "exists, skipping: $name" && continue
  ln -s "$d" "$dest"
done
```

### 3. Log in to Kei

```sh
kei login
```

Approve the device code in the browser. You need to be an owner/admin of the Kei org.

### 4. Ensure you have a workspace

```sh
kei workspaces list
```

If empty, create one in the [Kei console](https://app.haikeilabs.com).

### 5. Run the setup script

```sh
bash ~/src/haikei-skills/skills/kei-harness-setup/scripts/setup-claude-code.sh
```

This script does everything automatically:

| Step | What it does |
|---|---|
| **Prerequisites** | Checks `kei`/`kei-proxy` are on PATH, versions ≥ 0.1.13 / 0.1.26, warns about oh-my-zsh alias conflicts |
| **Login** | Verifies `kei workspaces list` works (you're logged in) |
| **Runtime installation** | Creates a new runtime installation (`claude_code@<hostname>`), pipes a credential directly into `~/.config/kei.yaml` (never printed), and bootstraps the runtime |
| **Heartbeat service** | Installs a background heartbeat daemon if available (keeps the runtime active after terminal closes) |
| **Harness registration** | Registers the Claude Code harness against the installation |
| **Sync** | Shows a dry-run preview, then asks confirmation before syncing. Syncs Kei policy into `~/.claude/settings.json` (backs up existing config first) |
| **Verification** | Runs `verify.sh claude_code` — checks PATH, policy bundle not expired, native config exists, harness is registered, bootstrap succeeds |

### 6. Verify denial (prove it fails closed)

```sh
# Permitted call (should allow)
kei-proxy authorize --user test --tool git.status --action git:read --resource repo:test

# Unbound call (must be DENY)
kei-proxy authorize --user test --tool nonexistent.tool --action unknown:action --resource unknown:resource
```

If the unbound call returns non-zero, Kei is working — it fails closed.

---

**Key gotchas on macOS:**

- **oh-my-zsh alias:** `kei` may be shadowed by the kubectl plugin (`alias kei='kubectl edit ingress'`). Run `unalias kei` or use `command kei`.
- **BSD date in verify.sh:** The script handles both GNU and BSD `date`, so it works on macOS.
- **Config permissions:** `~/.config/kei.yaml` must be mode `600` — the script enforces this.

**The script is idempotent** — safe to re-run. It skips steps that are already complete.
