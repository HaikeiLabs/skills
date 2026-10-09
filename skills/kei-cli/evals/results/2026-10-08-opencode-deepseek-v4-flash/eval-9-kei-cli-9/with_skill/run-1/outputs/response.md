Set `KEI_RUNTIME_STATE_DIR` to a user-writable path before running bootstrap:

```sh
export KEI_RUNTIME_STATE_DIR="$HOME/.kei/state"
mkdir -p "$KEI_RUNTIME_STATE_DIR"
chmod 0700 "$KEI_RUNTIME_STATE_DIR"
kei runtime bootstrap
```

This is a known bug (HAI-374) — `kei-proxy` hard-codes the Linux path `/var/lib/kei-proxy` instead of using a macOS-appropriate default. The env var works around it.
