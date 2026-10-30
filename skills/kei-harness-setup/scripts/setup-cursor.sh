#!/bin/sh
# setup-cursor.sh — Kei-governed Cursor harness
# POSIX sh, idempotent, safe to re-run.
#
# Cursor support is pending kei-cli#233 (not released yet): on a released
# kei-cli the `kei connect cursor` / `kei harness sync --harness cursor`
# calls fail closed (exit non-zero, nothing written).
set -eu

KIND="cursor"
HARNESS_NAME="Cursor"
NATIVE_CONFIG="${HOME}/.cursor/cli-config.json"

. "$(dirname "$0")/setup-lib.sh"
