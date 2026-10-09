**Likely cause:** Stale policy bundle (HAI-403). Desktop harnesses (OpenCode on a workstation) are auto-discovered — no `kei harness add` is needed. The policy bundle on the runtime hasn't refreshed yet, so it doesn't recognize the harness when `sync` runs.

**Fix:** Trigger a policy refresh — either edit a policy in the console (any change triggers a push), or run `kei-proxy policy sync` to force a bundle fetch, then retry `kei harness sync --harness opencode`. The background poll can take up to 6 hours, so force it.
