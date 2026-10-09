This is covered in the Kei troubleshooting guide — **Troubleshooting #9**.

**Root cause:** A harness command policy uses `web_search` (bare tool name) as its `dst_pattern`, but the policy bundle schema requires a `tool:` prefix. kei-proxy rejects the entire bundle on schema validation, failing closed (denying everything).

**Fix:** Update the policy's `dst_pattern` from `web_search` to `tool:web_search`. In the console go to **Policies →** select the policy → edit the destination pattern. Or via CLI:

```sh
kei policies update <name-or-id> --workspace WS --dst-pattern tool:web_search
```

Then reload the bundle:

```sh
kei runtime bootstrap
# or restart kei-proxy serve
```

If you don't know which policy it is, run `kei policies list --workspace WS` and look for one whose `dst_pattern` is a bare tool name.
