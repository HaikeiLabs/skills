Good question. Here's what I can tell you from the skill docs:

**Command to use:**

```sh
kei policies import --from claude --workspace <your-workspace>
```

This reads `~/.claude/settings.json` → `permissions.allow` and translates each entry into a `shell:<entry>` permit policy at priority 100. It's a **dry run by default** — it prints what it would create and stops. To actually create them:

```sh
kei policies import --from claude --workspace <your-workspace> --apply
```

**Things to be careful about:**

1. **Back up your existing `settings.json` first** — `kei harness sync` overwrites the native config file. The import step is safe (it just creates Kei policies), but the subsequent sync step will rewrite your native file.

2. **No deny rendering yet** — the renderer only writes permit entries. If you had any tool-level deny patterns, they won't be translated to Kei deny policies until HAI-400 ships.

3. **Catch-all `shell:* deny` is harmful** — if you were to create one, it would write `*` into `permissions.deny` and Claude Code's deny-beats-allow semantics would block every permitted command too.

4. **The `--from` value for Claude Code is `claude`** (not `claude_code`). Use `--file PATH` if your settings.json is in a non-default location.

5. **Only `shell:` rules get rendered back** — `skill:` and `path:` policies created via import are governance-only and have no native equivalent in Claude Code's settings.json.

That's what I've got from the skill docs. I don't have access to the actual `kei help` output or schemas to verify exact flag values for your installed version, so you should also run `kei --version` (needs > 0.1.6) and `kei policies import --help` to confirm before proceeding.
