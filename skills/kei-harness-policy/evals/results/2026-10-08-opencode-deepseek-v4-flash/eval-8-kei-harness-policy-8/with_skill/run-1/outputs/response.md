Let me look at the skill files and codebase to understand the system.
Here's what happened and what `kei-proxy` does:

**Version mismatch cause:** The proxy has **hard monotonic rollback protection** (`bundle-versioning.md:125-135`). It persists the highest `bundle_version` it ever activated (42 in this case). When the catalog served version 41, the proxy rejected it because `41 <= 42` — it will never activate a version ≤ the max it has already seen, even if the catalog erroneously serves an older bundle. The catalog likely returned a stale/cached bundle (e.g., the `current` endpoint reused a stored bundle that was minted before a policy change bumped the workspace revision, or there's a caching layer returning stale data).

**What `kei-proxy` does:** It's the runtime Policy Decision Point (PDP) that:
- Persists and enforces policy bundles locally
- Authorizes tool calls (ABAC) against the active bundle
- Runs a background `PolicyRefresher` that polls the catalog every 30–300s with ETag-based `If-None-Match` for change detection
- Rejects candidates with wrong schema, audience mismatch, bad digest, or version ≤ max activated (rollback)
- Manages bundle lifecycle through states: `COLD` → `ACTIVE` → `STALE_BUT_VALID` → `EXPIRED` (fail-closed on expiry)
- Injects credentials for `shell:` dst commands via `kei://` references without exposing secrets to the agent
- Supports `kei-proxy policy show` (read-only state) and `kei-proxy policy sync` (force refresh)

The harness sync layer (`kei harness sync`) is separate — it reads the bundle to render native config, but the proxy is the offline enforcement engine that never downgrades its bundle version.
