You'd create two separate policies using the `shell:` dst scheme:

1. **Allow git:** `src-pattern=harness:opencode`, `dst-pattern=shell:git`, `effect=permit`
2. **Deny curl:** `src-pattern=harness:opencode`, `dst-pattern=shell:curl`, `effect=deny`

Both at the same priority (e.g. 100). The `shell:<prefix>` scheme matches the first token after shell normalization — `shell:git` matches any `git ...` invocation, `shell:curl` matches any `curl ...` invocation. Deny beats permit at equal priority per ADR-028 §2, so curl is blocked while git is allowed. After creating the policies, run `kei harness sync` to render them into OpenCode's native `permission.bash` config.
