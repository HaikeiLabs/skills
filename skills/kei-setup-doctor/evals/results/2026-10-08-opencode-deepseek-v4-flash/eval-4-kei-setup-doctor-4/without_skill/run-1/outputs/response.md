That's unlikely to fix a 401 since `kei login` presumably succeeds. A 401 on a subsequent command means the token/credential isn't being used or has expired/cached wrong. What does `kei login` actually do — save a token somewhere? Could be a file path mismatch or the `--installation` flag needs its own auth scope.

Want me to look through the kei codebase to find the root cause?
