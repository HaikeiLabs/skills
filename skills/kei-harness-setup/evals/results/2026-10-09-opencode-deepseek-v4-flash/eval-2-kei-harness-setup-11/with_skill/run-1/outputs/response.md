All three run `kei feedback --description "..." --export <kind>`. The harness-specific commands and what happens to secrets:

- **Claude Code:** `kei feedback --description "what happened and what you expected" --export claude`
- **Codex:** `kei feedback --description "what happened and what you expected" --export codex`
- **OpenCode:** `kei feedback --description "what happened and what you expected" --export opencode` (needs `opencode` on PATH)

Optionally add `--session <session-id>` to pick a specific session; by default it attaches the most recent session from the current directory.

**Secrets:** On your machine before anything is sent, the CLI redacts API keys (Anthropic, OpenAI), GitHub/Slack tokens, AWS keys, JWTs, `Bearer` tokens, private-key blocks, Kei runtime tokens, and `password=`/`token=`/`secret=` values — each becomes `[REDACTED:<kind>]`. It then prints a preview (description, file sizes, redaction counts — never content) and prompts `Send? [y/N]`. Only a `y`/`yes` sends. `--file` and `--screenshot` attachments are *not* redacted, so you check those yourself. If a Kei runtime token appears in the transcript, the CLI warns of the leak and tells you to rotate.
