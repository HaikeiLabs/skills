Use `kei bot status --installation <ID>` to check the installation's heartbeat/connection state. A "pending" status means the runtime hasn't sent its first heartbeat yet — it's evidence about connectivity, not proof of health. Collect:

- The installation ID and `kei bot status` output
- `kei-proxy` logs from the runtime host (check stderr for bootstrap/heartbeat errors)
- The `KEI_RUNTIME_TOKEN` environment variable is **present** (don't print/paste it — just confirm it exists)
- Network reachability from the runtime to the control plane (`app.haikeilabs.com:443`)

If the runtime never transitions to `active`, the heartbeat path is broken — check credential validity, outbound connectivity, and that `kei-proxy runtime bootstrap` completed without error. Don't rotate or re-issue the credential yet, as that would break an already-deployed runtime without fixing the root cause.
