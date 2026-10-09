The most likely cause is a **cached policy bundle from the old credential/installation** (`HAI-404`). On macOS the cache lives at:

```
~/Library/Application Support/kei-proxy
```

Check it exists, then **move it aside** before re-bootstrapping:

```sh
mv ~/Library/Application\ Support/kei-proxy ~/Library/Application\ Support/kei-proxy.bak
```

Then re-run `kei runtime bootstrap` with the new credential to fetch the correct bundle. Also verify the installation's workspace scope matches the new credential — if `kei bot status` returns `409`, rotate with `--workspace` to re-scope:

```sh
kei bot credential --installation <ID> --rotate --workspace <name|id>
```
