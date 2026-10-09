Let me load the skill to give you an accurate answer.
Based on the Kei permissions model docs (specifically the "Kei-only permission management" section at `permissions-model.md:151`), here's the safe approach:

1. **First**, run `kei harness sync --harness claude_code` to establish Kei's entries in `~/.claude/settings.json` under `permissions.allow`.
2. **Then**, manually remove your own hand-written allow/deny entries from that file — Kei only edits entries it owns (marked with a `# kei-managed` comment), so your entries persist across syncs and must be removed by hand.
3. **Keep** the harness's permission mode set to its default (`ask`), not `allow-all` — this ensures any command that isn't in Kei's rendered allow list prompts you rather than auto-running.
4. **Run** `kei harness sync --harness claude_code` again to confirm the file only contains Kei-managed entries.

**Key safeguards**: Kei keeps a timestamped backup (`~/.claude/settings.json.kei-backup-<timestamp>`) before every write, so you can restore if something breaks. Also, use `--dry-run` first to preview what sync would change.
