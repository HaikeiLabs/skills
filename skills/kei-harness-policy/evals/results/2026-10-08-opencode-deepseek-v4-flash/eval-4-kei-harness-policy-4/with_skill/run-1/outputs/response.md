Your policy bundle's `not_after` timestamp has passed, so the local `kei-proxy` enters the `EXPIRED` state and denies every governed call (fail-closed). This is covered in the **Bundle renewal** and **Troubleshooting** sections of the skill docs.

**What happened:**  
Policy bundles carry an expiry (`not_after` usually ~12h from issuance). A background refresher polls the control plane every 30–300s to swap in a fresh bundle before expiry, but if connectivity was lost or the refresh loop stalled, the bundle aged past `not_after` and the state machine transitioned to `EXPIRED`.

**How to fix it:**

1. **Re-establish connectivity** — ensure the runtime can reach the Kei control plane (check network, DNS, `KEI_RUNTIME_CONTROL_PLANE_URL`, and that the runtime token hasn't been rotated).
2. **Force a fresh bundle fetch:**
   ```sh
   kei-proxy policy sync
   ```
   (or `kei-proxy runtime bootstrap` if this is a fresh setup).
3. **Re-render native harness config:**
   ```sh
   kei harness sync --harness <KIND>
   ```
   so the harness's native allow/deny rules reflect the renewed bundle.

You can verify the current state at any time with `kei-proxy policy show`. If you're not sure which `KIND` to pass, start with `kei-proxy policy show` and check the output for clues, or list registered harnesses with `kei harness list`.
