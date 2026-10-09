Compare the **ReplicaSet images** (old vs. new) — a different image returning 404/405 is a **runtime/control-plane version skew** signal, not a networking fault. Also compare container logs and the exact endpoint path.

**Requires approval** (per guardrails): `kubectl rollout undo`, upgrading the control plane, or any deployment change — those are mutations. Read-only diagnosis (image diff, logs, `kei bot status`) is fine without approval.
