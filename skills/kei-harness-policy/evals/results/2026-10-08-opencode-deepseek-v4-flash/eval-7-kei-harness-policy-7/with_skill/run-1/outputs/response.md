**`STALE_BUT_VALID` means the bundle is still usable (decisions are enforced) but the background refresher hasn't gotten a successful response from the control plane within the `stale_after_seconds` window (default 300s).** It's not immediately critical — calls are still being authorized — but it's a warning that connectivity or credential health needs attention.

**Is it a problem?** Only if it persists. If it remains stale long enough that `not_after` passes, the state becomes `EXPIRED` and every governed call is denied. So treat it as a yellow flag.

**How to fix it:**

1. **Check network / DNS / URL** — verify the runtime can reach the control-plane URL (`KEI_RUNTIME_CONTROL_PLANE_URL`).
2. **Check the runtime token** — it may have expired or been rotated. Re-issue if needed.
3. **Force an immediate sync** — run `kei-proxy policy sync` to bypass the poll schedule and fetch a fresh bundle. If it succeeds, the state returns to `ACTIVE` on the next refresh cycle.
4. **Then re-render harness native config** — `kei harness sync --harness KIND` to pick up any policy changes.

If `kei-proxy policy sync` fails, the root cause is connectivity or credential-related (wrong URL, expired token, DNS failure, firewall).
