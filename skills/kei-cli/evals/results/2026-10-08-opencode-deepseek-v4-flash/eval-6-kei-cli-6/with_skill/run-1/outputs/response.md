You hit a known bug (HAI-370). The SSO sign-in flow loses the OAuth return address if you aren't already signed in at `app.haikeilabs.com`.

**Fix:** Sign in at `app.haikeilabs.com` first, then run `kei login` again — the browser will open to the approval page this time.
