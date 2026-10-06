#!/bin/sh
# setup-codex.sh — Kei-governed Codex harness
# POSIX sh, idempotent, safe to re-run.
set -eu

KIND="codex"
HARNESS_NAME="Codex"
NATIVE_CONFIG="${HOME}/.codex/default.json"

. "$(dirname "$0")/setup-lib.sh"
