#!/bin/sh
# setup-claude-code.sh — Kei-governed Claude Code harness
# POSIX sh, idempotent, safe to re-run.
set -eu

KIND="claude_code"
HARNESS_NAME="Claude Code"
NATIVE_CONFIG="${HOME}/.claude/settings.json"

. "$(dirname "$0")/setup-lib.sh"
