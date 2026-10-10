Use `kei feedback --description "..." --export codex --session <session-id>`. That attaches the Codex session transcript. Before anything is sent, the CLI **redacts** API keys, tokens, JWTs, private keys, and credential-shaped strings (they become `[REDACTED:<kind>]`). You'll get a preview showing what was redacted and the file sizes, then you confirm with `y`/`yes` before anything leaves your machine. If you're still worried, you can also attach extra evidence with `--file` and `--screenshot`.

Requires `kei` ≥ 0.1.20 and `kei login`.
