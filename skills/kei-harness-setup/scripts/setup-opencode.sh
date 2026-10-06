#!/bin/sh
# setup-opencode.sh — Kei-governed OpenCode harness
# POSIX sh, idempotent, safe to re-run.
set -eu

KIND="opencode"
HARNESS_NAME="OpenCode"
NATIVE_CONFIG="${OPENCODE_CONFIG_DIR:-${HOME}/.config/opencode}/opencode.json"

. "$(dirname "$0")/setup-lib.sh"
