Two things to check first, in order:

1. **Is the proxy actually running?** A disabled/missing kei-proxy denies *every* governed call (fail-closed). Check that `KEI_PROXY_DISABLED` is unset/false, `KEI_RUNTIME_TOKEN` and `KEI_RUNTIME_CONTROL_PLANE_URL` are present, and kei-proxy is on `PATH`. Run `kei-proxy authorize` for a known-permitted tool to confirm an allow.

2. **Is your policy bundle expired?** Every bundle has a `not_after` expiry — once past it, `kei-proxy` denies all calls with `reason_code: policy_bundle_expired`. Check with `kei-proxy policy show` or look for `bundle_expired` in runtime logs. Fix: re-establish connectivity and run `kei-proxy policy sync` (or `kei-proxy runtime bootstrap`) to force a fresh bundle fetch.

If both pass, check whether the agent identity is missing — the SDK denies governed calls when `agent_id` is empty.
