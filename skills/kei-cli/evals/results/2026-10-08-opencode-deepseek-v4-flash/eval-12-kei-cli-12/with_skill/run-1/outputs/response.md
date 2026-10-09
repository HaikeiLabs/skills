Two issues:

1. **`list` fails** because kei ≤0.1.12 calls retired console routes — upgrade to v0.1.13+.
2. **Test reachability** with `kei model-profiles readiness PROFILE --workspace WS` (there's no `test` subcommand yet).
