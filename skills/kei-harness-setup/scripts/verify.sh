#!/bin/sh
# verify.sh — post-setup verification for a Kei-governed harness
# Usage: verify.sh <kind>
#   kind  one of: claude_code, codex, opencode, pi, custom
#
# Exits 0 on success, 1 on verification failure.
# POSIX sh, idempotent, safe to re-run.
set -eu

KIND="${1:-}"

if [ "$KIND" = "--self-test" ]; then
  # Self-test: verify RFC3339 date parsing works for key cases (mirrors step 4 logic)
  echo "==> verify.sh self-test..."
  _errors=0
  _test_parse() {
    _input="$1"
    _label="$3"
    # Normalise as step 4 does
    _norm=$(echo "$_input" | sed 's/\.[0-9]*Z/Z/' | sed 's/+00:00$/Z/')
    _result=""
    # Try GNU date
    _result=$(date -d "$_norm" +%s 2>/dev/null || true)
    # Try BSD date
    if [ -z "$_result" ]; then
      _stripped=$(echo "$_norm" | sed 's/\.[0-9]*//')
      case "$_stripped" in
        *Z) _fmt='%Y-%m-%dT%H:%M:%SZ' ;;
        *+*) _fmt='%Y-%m-%dT%H:%M:%S%z' ;;
        *) _fmt='%Y-%m-%dT%H:%M:%S' ;;
      esac
      _result=$(date -j -u -f "$_fmt" "$_stripped" +%s 2>/dev/null || true)
    fi
    if [ -n "$_result" ]; then
      echo "  PASS  ${_label} ($_result)"
    else
      echo "  FAIL  ${_label}: parser returned empty"
      _errors=$((_errors + 1))
    fi
  }
  _test_parse "2027-12-31T23:59:59Z" "" "2027-12-31T23:59:59Z"
  _test_parse "2024-10-06T12:00:00Z" "" "2024-10-06T12:00:00Z"
  _test_parse "2025-03-15T18:30:00.123Z" "" "2025-03-15T18:30:00.123Z (fractional)"
  _test_parse "2025-06-01T00:00:00+00:00" "" "2025-06-01T00:00:00+00:00 (normalised)"
  if [ "$_errors" -gt 0 ]; then
    echo "FAIL  ${_errors} self-test(s) failed"
    exit 1
  fi
  echo "PASS  all self-tests passed"
  exit 0
fi

if [ -z "$KIND" ]; then
  echo "Usage: verify.sh <kind>" >&2
  echo "  kind: claude_code, codex, opencode, pi, custom" >&2
  echo "  also: --self-test" >&2
  exit 2
fi

echo "==> Verifying Kei setup for kind='${KIND}'..."

PASS=true
check() {
  _label="$1"
  shift
  if "$@"; then
    echo "  PASS  ${_label}"
  else
    echo "  FAIL  ${_label}"
    PASS=false
  fi
}

# --- 1. kei-proxy is on PATH ---
check "kei-proxy on PATH" command -v kei-proxy >/dev/null 2>&1

# --- 2. kei is on PATH ---
check "kei on PATH" command -v kei >/dev/null 2>&1

# --- 3. Policy state is available ---
check "kei-proxy policy show succeeds" kei-proxy policy show >/dev/null 2>&1

# --- 4. Policy bundle is not expired ---
POLICY_JSON=$(kei-proxy policy show 2>/dev/null || true)
if [ -n "$POLICY_JSON" ]; then
  EXPIRY=$(echo "$POLICY_JSON" | grep -oE '"not_after":"[^"]*"' | cut -d'"' -f4 || true)
  if [ -n "$EXPIRY" ]; then
    NOW_EPOCH=$(date +%s)
    # Normalise RFC3339: strip fractional seconds, normalise +00:00 to Z
    _EXPIRY_NORM=$(echo "$EXPIRY" | sed 's/\.[0-9]*Z/Z/' | sed 's/+00:00$/Z/')
    EXPIRY_EPOCH=""
    # Try GNU date
    EXPIRY_EPOCH=$(date -d "$_EXPIRY_NORM" +%s 2>/dev/null || true)
    # Try BSD date (macOS) — strip fractional seconds already done, keep T
    if [ -z "$EXPIRY_EPOCH" ]; then
      _EXPIRY_STRIPPED=$(echo "$_EXPIRY_NORM" | sed 's/\.[0-9]*//')
      case "$_EXPIRY_STRIPPED" in
        *Z) _FMT='%Y-%m-%dT%H:%M:%SZ' ;;
        *+*) _FMT='%Y-%m-%dT%H:%M:%S%z' ;;
        *) _FMT='%Y-%m-%dT%H:%M:%S' ;;
      esac
      EXPIRY_EPOCH=$(date -j -u -f "$_FMT" "$_EXPIRY_STRIPPED" +%s 2>/dev/null || true)
    fi
    if [ -n "$EXPIRY_EPOCH" ] && [ "$EXPIRY_EPOCH" -gt "$NOW_EPOCH" ] 2>/dev/null; then
      echo "  PASS  policy bundle not expired (expires ${EXPIRY})"
    elif [ -n "$EXPIRY_EPOCH" ]; then
      echo "  FAIL  policy bundle expired at ${EXPIRY}"
      PASS=false
    else
      echo "  WARN  could not parse bundle expiry '${EXPIRY}' — skipping expiry check"
    fi
  else
    echo "  WARN  could not parse bundle expiry from policy output"
  fi
else
  echo "  WARN  policy show returned no output"
fi

# --- 5. Native config is present ---
case "$KIND" in
  claude_code)
    NATIVE_CONFIG="${HOME}/.claude/settings.json"
    ;;
  codex)
    NATIVE_CONFIG="${HOME}/.codex/default.json"
    ;;
  opencode)
    NATIVE_CONFIG="${OPENCODE_CONFIG_DIR:-${HOME}/.config/opencode}/opencode.json"
    ;;
  *)
    NATIVE_CONFIG=""
    ;;
esac

if [ -n "$NATIVE_CONFIG" ]; then
  check "native config exists: ${NATIVE_CONFIG}" test -f "$NATIVE_CONFIG"
  if [ -f "$NATIVE_CONFIG" ]; then
    # Verify it contains Kei-managed entries (non-empty)
    CONFIG_SIZE=$(wc -c < "$NATIVE_CONFIG" | tr -d ' ')
    check "native config non-empty" test "$CONFIG_SIZE" -gt 20
  fi
fi

# --- 6. kei harness list shows last_synced_at ---
if kei harness list --json 2>/dev/null | grep -qE '"last_synced_at"'; then
  echo "  PASS  harness list includes last_synced_at"
else
  echo "  FAIL  harness list does not show last_synced_at (try: kei harness sync)"
  PASS=false
fi

# --- 7. Verify harness is registered for this kind ---
HARNESS_JSON=$(kei harness list --json 2>/dev/null || true)
if echo "$HARNESS_JSON" | grep -qE "\"kind\":\"${KIND}\""; then
  echo "  PASS  harness '${KIND}' is registered"
elif echo "$HARNESS_JSON" | grep -qE '"kind"'; then
  echo "  WARN  harness '${KIND}' not found in list; other kinds registered"
  echo "    Registered kinds: $(echo "$HARNESS_JSON" | grep -oE '"kind":"[^"]*"' | cut -d'"' -f4 | tr '\n' ' ')"
else
  echo "  FAIL  no harnesses registered at all"
  PASS=false
fi

# --- 8. Runtime bootstrap succeeds ---
check "runtime bootstrap succeeds" kei runtime bootstrap >/dev/null 2>&1

# --- Summary ---
echo ""
if [ "$PASS" = true ]; then
  echo "==> ALL CHECKS PASSED"
  exit 0
else
  echo "==> SOME CHECKS FAILED"
  exit 1
fi
