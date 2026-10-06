# Policy bundle versioning

How Kei policy bundles are identified, issued, refreshed, and expired across the
control plane (`kei-policy-catalog`), the runtime proxy (`kei-proxy`), and the
harness sync.

## Bundle identity

Every policy bundle has three version fields:

| Field | Type | Meaning |
| --- | --- | --- |
| `bundle_id` | UUIDv7 | Unique per issuance — every time a bundle is minted it gets a new id. Enables
  change detection on the proxy: a new `bundle_id` always means fresh content. |
| `bundle_version` | uint64 | Strictly increasing counter **per runtime installation**. Never reused.
  Bumped on every issuance of a bundle for that installation, even if the policy
  content hasn't changed (re-issue at half-life). The proxy persists the highest
  activated `bundle_version` and never activates one ≤ it (rollback protection). |
| `policy_revision` | uint64 | Workspace-wide counter that increases on every policy-affecting change
  (create, update, delete, reorder). An installation targeting the same workspace
  sees the same `policy_revision` after each change. The catalog reuses a stored
  bundle if the revision is the same, the bundle is unexpired, and it was issued
  within 6 hours — otherwise it mints a new bundle (with a new `bundle_version`). |

Two bundles may share the same `policy_revision` but have different
`bundle_id`/`bundle_version` if the first was re-issued at the half-life mark
without any policy change.

## Bundle payload

```json
{
  "schema": "kei.policy-bundle/v1",
  "bundle_id": "0192a1b0-0000-7000-8000-000000000001",
  "bundle_version": 42,
  "bundle_digest": "sha256-...",
  "policy_revision": 17,
  "issued_at": "2026-10-06T10:00:00Z",
  "not_after": "2026-10-06T22:00:00Z",
  "audience": {
    "installation_id": "uuid",
    "org_id": "uuid",
    "workspace_id": "uuid"
  },
  "issuer": "kei-policy-catalog",
  "policies": [ /* policy set */ ],
  "refresh": {
    "poll_interval_seconds": 60,
    "stale_after_seconds": 300
  }
}
```

## Bundle lifecycle

```
          fetch fails         fetch ok
              |                   |
              v                   v
         +--------+          +--------+
         |  COLD  | -------> | ACTIVE |  valid, enforcing
         +--------+          +--------+
                                  |
                            time passes
                            without refresh
                                  |
                                  v
                            +---------------+
                            | STALE_BUT_VALID|  within not_after but
                            +---------------+  refresh overdue
                                  |
                            not_after passes
                                  |
                                  v
                            +---------+
                            | EXPIRED |  fail-closed: every governed
                            +---------+  call denied
```

Additional transitions (may occur from any state):

| Transition | Condition | Next state |
| --- | --- | --- |
| Schema validation failed or digest mismatch | `VALIDATE` | `INVALID` |
| Schema version is unknown or a closed-schema field is present | `VALIDATE` | `UNSUPPORTED` |
| Control plane marks bundle revoked | `REVOKE` | `REVOKED` |

The proxy stores these states in its local state directory
(`KEI_RUNTIME_STATE_DIR`). Once a bundle enters `INVALID`, `UNSUPPORTED`, or
`REVOKED` it does not leave that state without a fresh `policy sync` or
`runtime bootstrap`. While in `INVALID` or `UNSUPPORTED` the proxy denies every
governed call (fail-closed). `REVOKED` is reserved for future control-plane
revocation signalling and is not yet issuable by the catalog.

## Polling and refresh

The `PolicyRefresher` (`runtime/policy_refresher.go`) runs a background poll
loop while `kei-proxy serve` is alive. The loop is independent of the heartbeat
— there is no heartbeat-hint mechanism.

1. The refresher polls `GET /api/v1/runtime/policy-bundles/current` every
   `poll_interval_seconds` from the active bundle (issuer default 60 s, clamped
   by the proxy to [30, 300] with ±10 % jitter).
2. The request carries `If-None-Match` with the active bundle's digest in
   quotes (as ETag). If the catalog responds `304 Not Modified`, the proxy
   updates its last-successful-refresh timestamp and the active bundle remains
   current.
3. On `200` the proxy validates the schema (`kei.policy-bundle/v1`), checks
   the digest (sha256 of the payload bytes = `bundle_digest`), verifies the
   audience matches, and activates the new bundle.
4. A rejected candidate (invalid schema, wrong audience, bad digest) is
   discarded; the active bundle continues to be enforced.
5. If the last successful refresh is older than `stale_after_seconds`
   (issuer default 300 s), the state transitions to `STALE_BUT_VALID` —
   decisions still succeed but the operator should investigate connectivity.
6. If `not_after` passes, the state becomes `EXPIRED` and every governed call
   is denied with `reason_code: policy_bundle_expired`.

### Locking

One refresher runs per state directory (`KEI_RUNTIME_STATE_DIR`). A file lock
prevents concurrent refreshes — the second caller skips if a refresh is already
in progress for this installation.

## Rollback protection

The proxy persists the highest `bundle_version` it has ever activated. On every
new bundle candidate:

- If `candidate.bundle_version <= persisted.max_activated_version`, the
  candidate is rejected as a rollback.
- This is a **hard monotonicity lock**: once a proxy has seen version 42, it
  will never activate version 41 or lower, even if the catalog somehow serves
  an older bundle.
- The persisted value lives in the state directory and survives proxy restarts.

## Compatible bundles

The catalog's `current` endpoint reuses a stored bundle if **all** of these
hold:

1. The stored bundle's `policy_revision` matches the current workspace
   revision.
2. The stored bundle has not passed `not_after`.
3. The stored bundle was issued within the **reuse window** (6 hours).

If any condition fails, the catalog mints a new bundle (new `bundle_id`,
incremented `bundle_version`, new `issued_at`/`not_after`).

This means a proxy that polls frequently may receive the same bundle_id for
multiple consecutive responses (the 304 path), while a proxy that has been
offline for hours gets a freshly minted bundle that may reference the same
`policy_revision` but carries a different `bundle_id`.

## Proxy subcommands for bundle management

| Command | What it does |
| --- | --- |
| `kei-proxy policy show` | Prints the persisted bundle's version, digest, revision, validity window, and state. Never prints policy contents. |
| `kei-proxy policy sync` | Forces an immediate fetch-and-persist of the current bundle, bypassing the normal poll schedule. Exits with an error if the control plane is unreachable. |
| `kei-proxy runtime bootstrap` | Runs `policy sync` plus installation verification and the first heartbeat. Preferred for initial setup. |

### `kei-proxy policy show` output

The show command returns a human-readable summary:

```
Bundle ID:      0192a1b0-0000-7000-8000-000000000001
Bundle Version: 42
Bundle Digest:  sha256-abc123def...
Policy Revision: 17
Issued At:      2026-10-06T10:00:00Z
Not After:      2026-10-06T22:00:00Z
State:          active
```

No policy content is ever printed by `kei-proxy policy show`. The command reads
the persisted state from disk (`KEI_RUNTIME_STATE_DIR`) and does not contact the
control plane.

## Harness sync and the bundle

`kei harness sync` (not a proxy command) fetches the current policy bundle
using the runtime token and renders the harness's native config from the
`shell:` policies. After rendering, it sends a PATCH report to the catalog at
`PATCH /api/v1/runtime/harnesses/{agentID}?update_mask=last_synced_at,last_synced_bundle_version,last_synced_digest`
(`kei-cli internal/app/harness.go:332`):

| Field | Type | Meaning |
| --- | --- | --- |
| `last_synced_at` | RFC3339Nano string | When the sync completed |
| `last_synced_bundle_version` | int64 | The `bundle_version` from the fetched bundle |
| `last_synced_digest` | string | `"sha256:<hex>"` — sha256 of the raw bundle payload bytes |

The `update_mask` query parameter (AIP field-mask convention) names the three
fields being patched. This report lets the catalog track which installation has
activated which bundle version and digest.

## Subject resolution in the bundle

The bundle carries two fields that govern how the proxy maps a caller's
external identity to a Kei user identity at authorize time
(`internal/policybundle/bundle.go`):

```json
{
  "subject_resolution": {
    "mode": "sdk|passthrough",
    "max_cache_seconds": 300
  },
  "identities": [
    {
      "source": "teams",
      "external_id": "user@domain.com",
      "user_id": "uuid",
      "status": "active",
      "groups": ["group-a", "group-b"]
    }
  ]
}
```

| Field | Type | Meaning |
| --- | --- | --- |
| `subject_resolution.mode` | string | How the proxy resolves the caller (`sdk` = call `POST /api/v1/runtime/subject-attributes:resolve`, `passthrough` = trust the `--user` flag directly). |
| `subject_resolution.max_cache_seconds` | int | How long the proxy may cache a resolved identity before re-resolving. |
| `identities[].source` | string | Identity provider that asserted this identity (e.g. `teams`, `slack`). |
| `identities[].external_id` | string | The user's id within that provider. |
| `identities[].user_id` | string | The corresponding Kei user id. |
| `identities[].status` | string | `active`, `disabled`, or `pending`. |
| `identities[].groups` | []string | Kei group memberships carried over from the provider. |

The exact runtime semantics (resolve vs. passthrough, cache behavior, enrolment
fallback) follow ADR-026. Without a resolved identity the call is denied with
an enrollment object.

## Troubleshooting

### "All governed calls are denied"

Check the bundle state:

```sh
kei-proxy policy show
```

- **State: EXPIRED** — The bundle's `not_after` has passed. Run `kei-proxy
  policy sync` to fetch a fresh one, then `kei harness sync --harness KIND` to
  re-render native config.
- **State: COLD** — No bundle has ever been fetched. Run `kei-proxy runtime
  bootstrap`.
- **State: ACTIVE or STALE_BUT_VALID** — The bundle is not the problem; check
  the policy set and the authorize call parameters.

### "Bundle version is lower than expected"

The proxy has rollback protection. If the catalog served a bundle with a lower
`bundle_version` than what the proxy has activated, the proxy rejects it. Check
whether the installation credential targets the correct workspace and that the
catalog's stored bundle is not stale. Run `kei-proxy policy sync` to force a
fresh issuance from the catalog.

### "The proxy keeps saying STALE_BUT_VALID"

The background refresher has not received a successful response within
`stale_after_seconds`. Likely causes:

- Network connectivity issue between the runtime and the control plane.
- The control-plane URL (`KEI_RUNTIME_CONTROL_PLANE_URL`) is wrong.
- The runtime token has expired or been rotated (re-issue with
  `kei-credential-rotation`).
- DNS resolution for the control-plane hostname is failing.

Run `kei-proxy policy sync` to test connectivity immediately. If it succeeds,
the state returns to ACTIVE on the next refresh cycle.

### "The bundle was issued with the wrong audience"

The `audience` in the bundle (installation_id, org_id, workspace_id) must match
the runtime's identity exactly. A mismatch means the bundle was fetched with
credentials from a different installation. Check which installation the
`KEI_RUNTIME_TOKEN` belongs to.

### "What bundle_version does my runtime have?"

```sh
kei-proxy policy show | grep "Bundle Version"
```

This reads the persisted state without contacting the control plane.

### "Digest mismatch after a bundle fetch"

If the sha256 of the fetched payload bytes does not equal `bundle_digest`, the
proxy rejects the candidate. This should never happen with a trustworthy
control plane; if it does, the connection may be compromised or a proxy may be
corrupting the response. Check TLS and retry with `kei-proxy policy sync`.
