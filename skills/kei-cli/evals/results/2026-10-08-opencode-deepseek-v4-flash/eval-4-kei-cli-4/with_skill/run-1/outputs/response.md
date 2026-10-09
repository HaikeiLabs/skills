The CLI token is **short-lived** (not a persistent session). It expired since yesterday's login — `kei login` again and it'll work.

Also double-check the API URL: the token is bound to the host you authenticated against. If you logged into `staging` but the command defaulted to `app.haikeilabs.com` (or vice versa), it would also show `not logged in`. Use `--api-url` to match the environment you logged into.
