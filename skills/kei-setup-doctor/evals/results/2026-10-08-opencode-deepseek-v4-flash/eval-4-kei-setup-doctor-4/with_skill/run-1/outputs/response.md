Don't retry login — that won't fix a 401 from `kei bot status`. A successful login just means you authenticated to *someone's* org. The 401 means that session isn't authorized for *that installation*. Likely causes:

1. **Organization mismatch** — your login session belongs to a different org than the installation. Run `kei bot status` without the flag to see which org you're authenticated against, or log in with an account that's an owner/admin of the installation's org.
2. **Credential never created** — if the installation is still `pending/unverified` with no credential, `status` returns 401 because there's nothing to authorize against. Create one: `kei bot credential --installation <ID> --workspace <name|id>`.
3. **Stale session** — try `kei logout && kei login` to get a fresh token, but this is the least likely cause.

Run these diagnostics first:
```sh
kei bot status --installation <ID> --verbose   # any org/credential hints?
kei --version && kei help                      # check version
```
