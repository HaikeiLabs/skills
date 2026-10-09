This is covered in the skill's troubleshooting section (item #7). The root cause is a **stale policy bundle** cached by `kei-proxy` — the new harness registration isn't reflected yet (HAI-403).

**Fix:** Any policy edit triggers a bundle refresh. If you can edit a policy:

```sh
kei policies update <any-policy> --workspace WS --description "no-op refresh"
kei harness sync --harness claude_code
```

If you can't edit a policy, wait for the background refresh (up to 6 hours). The workaround forces the bundle to reload so sync sees the registered harness.

Also confirm the agent is already attached to the installation (`kei bot agents add`) — desktop harnesses are auto-discovered by sync, but the agent must exist on the installation first.
