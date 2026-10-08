#!/bin/sh
# setup-lib.sh — shared library for harness setup scripts
# Source this file after setting KIND, HARNESS_NAME, NATIVE_CONFIG.
# POSIX sh, idempotent, safe to re-run.
#
# Usage in per-harness scripts:
#   KIND="claude_code"
#   HARNESS_NAME="Claude Code"
#   NATIVE_CONFIG="${HOME}/.claude/settings.json"
#   . "$(dirname "$0")/setup-lib.sh"

set -eu

# --- Utility functions ---
_die() { echo "FATAL: $*" >&2; exit 1; }
_info() { echo "==> $*"; }
_warn() { echo "WARN: $*" >&2; }

# --- Guard: required variables ---
: "${KIND:?must be set before sourcing setup-lib.sh}"
: "${HARNESS_NAME:?must be set before sourcing setup-lib.sh}"
: "${NATIVE_CONFIG:?must be set before sourcing setup-lib.sh}"

NATIVE_BACKUP="${NATIVE_BACKUP:-${NATIVE_CONFIG}.kei.bak}"

# --- 1. Check kei and kei-proxy on PATH ---
_info "Checking Kei CLI and proxy..."

KEI_PATH=$(command -v kei || true)
KEI_PROXY_PATH=$(command -v kei-proxy || true)

if [ -z "$KEI_PATH" ] || [ -z "$KEI_PROXY_PATH" ]; then
  cat >&2 <<INSTALL_EOF
ERROR: kei or kei-proxy not found on PATH.

Install both with:
  curl -fsSL https://kei-cli-releases.s3.us-east-1.amazonaws.com/kei-cli/install.sh | bash -s -- -d ~/.local/bin

Then add ~/.local/bin to your PATH and re-run this script.
INSTALL_EOF
  exit 1
fi

# Check for oh-my-zsh alias shadow (aliases aren't inherited by /bin/sh)
if command -v timeout >/dev/null 2>&1; then
  _ALIAS_OUT=$(timeout 3 "${SHELL:-/bin/zsh}" -ic 'type kei' 2>/dev/null || true)
else
  _ALIAS_OUT=$("${SHELL:-/bin/zsh}" -ic 'type kei' 2>/dev/null || true)
fi
case "$_ALIAS_OUT" in
  *alias*|*kubectl*)
    _warn "oh-my-zsh's kubectl plugin defines 'alias kei=kubectl edit ingress',"
    _warn "which shadows the Kei CLI. Fix options:"
    _warn "  - Run 'unalias kei' in your current shell, then re-run this script."
    _warn "  - Add 'unalias kei' after 'source \$ZSH/oh-my-zsh.sh' in ~/.zshrc."
    _warn "  - Use the full path ~/.local/bin/kei instead of 'kei'."
    _warn "  - Use 'command kei' instead of 'kei'."
    ;;
esac

# Check kei version >= 0.1.13
KEI_VERSION=$(kei --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || echo "0.0.0")
_info "kei version: ${KEI_VERSION}"
if ! echo "$KEI_VERSION" | awk -F. '{ if ($1 > 0 || $2 > 1 || ($2 == 1 && $3 >= 13)) exit 0; exit 1 }'; then
  _die "kei >= 0.1.13 required (found ${KEI_VERSION}). Run the installer above to upgrade."
fi

# Check kei-proxy version >= 0.1.26
KEI_PROXY_VERSION=$(kei-proxy --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || echo "0.0.0")
_info "kei-proxy version: ${KEI_PROXY_VERSION}"
if ! echo "$KEI_PROXY_VERSION" | awk -F. '{ if ($1 > 0 || $2 > 1 || ($2 == 1 && $3 >= 26)) exit 0; exit 1 }'; then
  _die "kei-proxy >= 0.1.26 required (found ${KEI_PROXY_VERSION}). Run the installer above to upgrade."
fi

# --- 2. Check login ---
_info "Checking Kei login status..."
if ! kei workspaces list >/dev/null 2>&1; then
  _info "Not logged in. Starting device-code login..."
  echo ""
  echo "Run:  kei login"
  echo ""
  echo "Approve in the browser, then re-run this script."
  exit 1
fi
_info "Logged in."

# --- 3. Check runtime config and installation ---
_info "Checking runtime config..."
KEI_YAML="${HOME}/.config/kei.yaml"
BOOTSTRAP_OK=false

if [ -f "$KEI_YAML" ]; then
  CONFIG_MODE=$(stat -f '%Lp' "$KEI_YAML" 2>/dev/null || stat -c '%a' "$KEI_YAML" 2>/dev/null || echo "unknown")
  if [ "$CONFIG_MODE" != "600" ] && [ "$CONFIG_MODE" != "0600" ]; then
    _warn "${KEI_YAML} should be mode 0600 (found ${CONFIG_MODE})"
    chmod 600 "$KEI_YAML"
  fi
  _info "Trying bootstrap with existing config..."
  if BOOT_OUT=$(kei runtime bootstrap 2>&1); then
    BOOTSTRAP_OK=true
    _info "Bootstrap succeeded."
  else
    case "$BOOT_OUT" in
      *401*|*unauthorized*|*token*invalid*)
        _warn "Existing token rejected (401). A new machine needs its own installation."
        ;;
      *)
        _warn "Bootstrap failed: ${BOOT_OUT}"
        ;;
    esac
  fi
fi

if [ "$BOOTSTRAP_OK" = false ]; then
  _info "Setting up a new runtime installation for this machine..."

  HOSTNAME=$(hostname -s 2>/dev/null || hostname 2>/dev/null || echo "unknown")
  INSTALL_NAME="${KIND}@${HOSTNAME}"

  _info "Discovering workspace..."
  WS_LIST=$(kei workspaces list 2>&1)
  WS_ID=$(echo "$WS_LIST" | grep -oE '[a-f0-9-]{36}' | head -1 || true)
  if [ -z "$WS_ID" ]; then
    _die "No workspace found. Create one in the console first."
  fi
  _info "Workspace: ${WS_ID}"

  _info "Creating runtime installation '${INSTALL_NAME}'..."
  INSTALL_OUT=$(kei bot init --platform cli --name "$INSTALL_NAME" --workspace "$WS_ID" 2>&1)
  INSTALL_ID=$(echo "$INSTALL_OUT" | grep -oE '[a-f0-9-]{36}' | head -1 || true)
  if [ -z "$INSTALL_ID" ]; then
    _die "Failed to create installation. Output: ${INSTALL_OUT}"
  fi
  _info "Installation ID: ${INSTALL_ID}"

  _info "Creating credential and piping into kei setup..."
  kei bot credential --installation "$INSTALL_ID" --workspace "$WS_ID" | kei setup --control-plane-url https://app.haikeilabs.com
  echo ""
  _info "Credential created and config written (never printed to terminal)."

  _info "Bootstrapping runtime..."
  if ! kei runtime bootstrap; then
    _die "Runtime bootstrap failed after fresh setup. Check the output above."
  fi
  _info "Bootstrap succeeded."
fi

# --- 3a. Install background heartbeat service ---
_info "Checking heartbeat service..."
if kei runtime service install --help >/dev/null 2>&1; then
  if kei runtime service status 2>/dev/null | grep -qE 'active|running'; then
    _info "Heartbeat service already running."
  else
    _info "Installing background heartbeat service (HAI-406)..."
    kei runtime service install 2>&1 || _warn "Service install failed; run manually later: kei runtime service install"
  fi
else
  _warn "'kei runtime service install' not available in this version. TODO: install heartbeat service manually when HAI-406 ships."
fi

# --- 4. Discover installation ID (post-bootstrap) ---
INSTALLATION_ID=""
if kei harness list --json 2>/dev/null | grep -qE '"kind":"[^"]+"'; then
  INSTALLATION_ID=$(kei harness list --json 2>/dev/null | grep -oE '"installation_id":"[^"]+"' | cut -d'"' -f4 | head -1 || true)
fi
if [ -z "$INSTALLATION_ID" ]; then
  if kei bot status --json 2>/dev/null | grep -qE '"installation_id"'; then
    INSTALLATION_ID=$(kei bot status --json 2>/dev/null | grep -oE '"installation_id":"[^"]+"' | cut -d'"' -f4 || true)
  fi
fi
if [ -z "$INSTALLATION_ID" ] && [ -f "$KEI_YAML" ]; then
  INSTALLATION_ID=$(grep -oE 'installation_id:[[:space:]]*"?[a-f0-9-]+"?$' "$KEI_YAML" | grep -oE '[a-f0-9-]{36}' || true)
fi

if [ -z "$INSTALLATION_ID" ]; then
  _die "Could not determine installation ID after bootstrap."
fi
_info "Installation ID: ${INSTALLATION_ID}"

# Check installation status
STATUS_OUTPUT=$(kei bot status --installation "$INSTALLATION_ID" 2>&1 || true)
if echo "$STATUS_OUTPUT" | grep -qE '"status":"pending"'; then
  _warn "Installation status is 'pending' — no heartbeat received yet. This is normal"
  _warn "for a fresh setup; the first heartbeat will move it to 'active'. Proceeding..."
fi

# --- 5. Register harness ---
_info "Registering ${HARNESS_NAME} harness (kind: ${KIND})..."

# Check if harness already registered for this installation
_HARNESS_LIST=$(kei harness list --installation "$INSTALLATION_ID" --json 2>/dev/null || true)
if echo "$_HARNESS_LIST" | grep -qE "\"kind\":\"${KIND}\""; then
  _info "Harness '${KIND}' already registered; skipping."
else
  kei harness add --installation "$INSTALLATION_ID" --kind "$KIND" >/dev/null 2>&1 || true
  _info "Harness registered."
fi

# --- 6. Sync ---
_info "Previewing sync for ${KIND}..."
kei harness sync --dry-run --harness "$KIND" 2>&1 || true

echo ""
echo "Proceed with sync? [y/N] "
read -r _CONFIRM
if [ "$_CONFIRM" = "y" ] || [ "$_CONFIRM" = "Y" ]; then
  _info "Syncing ${HARNESS_NAME}..."
  if [ -f "$NATIVE_CONFIG" ] && [ ! -f "$NATIVE_BACKUP" ]; then
    cp "$NATIVE_CONFIG" "$NATIVE_BACKUP"
    _info "Backed up existing config to ${NATIVE_BACKUP}"
  fi
  kei harness sync --harness "$KIND"
  _info "Sync complete."
else
  _info "Sync skipped. Run 'kei harness sync --harness ${KIND}' later."
fi

# --- 7. Verify ---
_SCRIPT_DIR=$(dirname "$0")
if [ -x "${_SCRIPT_DIR}/verify.sh" ]; then
  "${_SCRIPT_DIR}/verify.sh" "$KIND"
else
  _warn "verify.sh not found; skipping verification."
fi

# --- 8. Next steps: first use ---
# Reached only when verify.sh passed (set -e exits on a failed check).
echo ""
_info "Setup is complete. One last step proves it works end to end:"
cat <<FIRST_USE_EOF
  NEXT STEPS - make one governed call in the harness (first use)

  1. In ${HARNESS_NAME}, make ONE governed tool call - for example, have
     ${HARNESS_NAME} run: git status
     (a shell command your policies permit). For desktop harnesses the call is
     decided natively from the Kei-rendered policy; the kei-proxy hook records
     the decision for audit. This proves the harness itself makes a governed
     call, not just the shell-level checks above.

  2. Confirm it in the console:
       - Audit Logs shows the call, recorded with the harness kind (${KIND}).
       - The installation's card shows the recent activity.

  3. The audit upload needs the runtime service running. Check it with:
       kei runtime service status
     If it is not running, the call is still governed but the audit record is
     not uploaded, so it will not appear in Audit Logs.
FIRST_USE_EOF
