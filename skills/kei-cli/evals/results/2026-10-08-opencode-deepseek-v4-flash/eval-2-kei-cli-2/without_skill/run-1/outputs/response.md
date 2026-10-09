## Diagnostic Checklist for Pending Runtime

**Inspect these areas (read-only):**

1. **Startup logs** — Collect full logs from the runtime's stdout/stderr from deployment start. Look for crashes, OOMKills, or config errors.
2. **Health check probe logs** — If liveness/readiness probes exist, inspect their logs and timestamps. A failing probe keeps the runtime "pending."
3. **Resource limits** — Compare requested vs. allocated CPU/memory. If limits are too tight, the runtime may be throttled or OOM-killed during init.
4. **Image pull events** — Check if the container image is pulling successfully (size, registry auth, digest mismatch). A stuck pull keeps the runtime pending.
5. **Startup command & entrypoint** — Verify the command/entrypoint is correct and that the binary/script exists. A missing entrypoint causes the runtime to restart loop without ever becoming ready.
6. **Environment variables & secrets** — Missing or malformed required env vars (e.g., database URL) can cause the process to hang at startup waiting for input.
7. **Volume/secret mount errors** — Mount failures (missing secrets, permission denied) prevent the process from starting.
8. **Networking dependencies** — If the runtime depends on another service (DB, cache, API), check if that dependency is reachable. A connection timeout at startup causes indefinite pending.
9. **Platform scheduling events** — Check for node/pod scheduling events (e.g., "insufficient resources", "node affinity"). The runtime may be pending because the scheduler can't place it.
10. **Deployment rollout status** — If using a rolling update, check if the previous version is still terminating. Sometimes the old runtime holds the slot.

**Evidence to collect (before any changes):**
- Full startup logs (last 5 minutes, with timestamps)
- Health check probe status and history
- Resource utilization at the time of deployment (CPU/memory graphs)
- Image pull status & registry response time
- Platform events around the deployment timestamp
- Configuration diff between last working deploy and current deploy
- Dependency connectivity test results

The most common root cause is a **failing startup command** or **resource limit too tight** causing the process to be killed before it can pass health checks.
