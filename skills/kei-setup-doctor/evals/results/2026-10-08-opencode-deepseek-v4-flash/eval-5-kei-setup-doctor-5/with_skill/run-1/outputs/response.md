Let me load the relevant skill first.
Kei stores only a hash of the credential — it **cannot** recover the old plaintext. The token must be rotated:

```sh
kei bot credential --installation <ID> --rotate | <destination-command>
```

Update every destination that uses that credential, then restart/reload the runtime. Let me know the installation ID and credential destination and I can walk through it.
