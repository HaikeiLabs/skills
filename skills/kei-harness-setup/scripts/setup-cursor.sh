#!/bin/sh
# setup-cursor.sh — Kei-governed Cursor harness
# POSIX sh, idempotent, safe to re-run.
#
# Cursor support shipped in kei-cli v0.3.0: `kei connect cursor` /
# `kei harness sync --harness cursor` render the policy bundle into the
# Cursor CLI config and fail closed (exit non-zero, nothing written) when a
# policy kind cannot be gated.
set -eu

KIND="cursor"
HARNESS_NAME="Cursor"
NATIVE_CONFIG="${HOME}/.cursor/cli-config.json"

. "$(dirname "$0")/setup-lib.sh"
