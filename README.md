# Haikei Skills

A collection of [Agent Skills](https://agent-skills.io/) for building and
operating AI assistants with Haikei's Kei platform: the **ABAC API** for
organization management, the **kei CLI** for customer-hosted bot runtimes, the
**agentware SDK** for policy and audit on agent tool calls, **kei-agents**
for agent definitions and tool schemas, and the **kei-setup-doctor** for
diagnosing and guiding Kei runtime installation across environments.

## Source of truth

`HaikeiLabs/skills` is the single canonical repository for these skills
(decision D-001). There is no parallel skills repository: content that was
drafted elsewhere has been reconciled into this repo, and no other copy is
maintained.

The markdown in `skills/` is also the source the web app renders as
documentation at build time (decision D-015) — one source, so what a coding
agent loads as a skill and what a consultant reads as docs cannot drift.
Two consequences for contributors:

- Editing a `SKILL.md` is a documentation change. Do not fork these files into
  the web repo or any other repo.
- Screenshots belong in the docs layer, never in `skills/`.

## Installing

### Claude Code

Install from the plugin marketplace:

```
/plugin marketplace add HaikeiLabs/skills
/plugin install haikei@haikei
```

### Codex

```
codex plugin marketplace add HaikeiLabs/skills
codex plugin add haikei@haikei
```

### opencode

Clone this repo and symlink or copy the skill folders into
`~/.config/opencode/skills/` (or the project's `.opencode/skills/`).

### Cursor

Add via **Settings > Rules > Add Rule > Remote Rule (GitHub)** with
`HaikeiLabs/skills`, or copy the skill folders into `~/.cursor/skills/`.

### Clone / Copy

Clone this repo and copy the skill folders into the appropriate directory for
your agent:

| Agent | Skill Directory | Docs |
|-------|-----------------|------|
| Claude Code | `~/.claude/skills/` | [docs](https://code.claude.com/docs/en/skills) |
| Cursor | `~/.cursor/skills/` | [docs](https://cursor.com/docs/context/skills) |
| opencode | `~/.config/opencode/skills/` | [docs](https://opencode.ai/docs/skills/) |
| Codex | `~/.codex/skills/` | [docs](https://developers.openai.com/codex/skills/) |

## Skills

Skills are contextual and auto-loaded based on your conversation. When a request
matches a skill's trigger description, the agent loads and applies the relevant
skill.

| Skill | Useful for |
|-------|------------|
| [haikei](skills/haikei/SKILL.md) | Router: "what are you trying to build?" maps a need to the right Haikei product and the skill to load |
| [kei-cli](skills/kei-cli/SKILL.md) | The `kei` CLI (standalone `kei-cli` repo): `setup`, `runtime bootstrap`, `login`/`logout` (OIDC device flow, admin-only, org-bound), `upgrade`, and `bot init/credential/agents/status/bind/delete` for customer-hosted runtimes |
| [kei-abac-api](skills/kei-abac-api/SKILL.md) | The ABAC HTTP API (`/api/v1/*`): organizations, workspaces, data connectors, groups, policies, users, invitations, agents, access levels, roles — where org management actually lives today |
| [agentware-sdk](skills/agentware-sdk/SKILL.md) | The open-source agentware SDK: policy enforcement, audit records, and delegation for agent tool calls, in Go, Python, and TypeScript |
| [kei-agents](skills/kei-agents/SKILL.md) | Agent definitions, tool schemas, semantic mappings, and governed connector bindings from the `kei-agents` package |
| [kei-setup-doctor](skills/kei-setup-doctor/SKILL.md) | A diagnosis *workflow* (not a CLI command — there is no `kei setup doctor`) for Kei runtime installations across local, AWS, Azure, or other customer environments |

## What is deliberately absent

- **No CLI commands that do not exist.** The `kei` CLI — the standalone
  `kei-cli` repository, not `kei/cmd/kei` — exposes `setup`, `runtime
  bootstrap`, `login`, `logout`, `upgrade`, and `bot` (`init`, `credential`,
  `agents`, `status`, `delete`, `bind`). There are no `org`, `workspace`,
  `connector`, `group`, `policy`, or `user` commands; org management is done
  through the ABAC API (see the `kei-abac-api` skill). There is also no
  `bot install`, `bot deploy`, `bot destroy`, `bot list`, or `kei setup doctor`
  — the setup doctor is a skill workflow, not a subcommand. This repo never
  invents a command that is not in the CLI's usage string.
- **No absolute local paths.** Every reference is product-name- and
  repo-relative so the repo can be published as-is.
- **No public-PyPI install instructions.** `kei-agents` is distributed from the
  internal AWS CodeArtifact index; public PyPI and npm publication are deferred
  to a tracked ticket (decision D-008). Skills document the CodeArtifact path,
  and every documented command must actually work. Go is unaffected — the module
  proxy resolves `pedro-agentware` with no CodeArtifact login.

## Validation

The suite is self-checking and is enforced by CI (`.github/workflows/ci.yml`,
Node 22) on every pull request and on pushes to `main`. Run all three before
opening a PR:

```bash
node scripts/verify-skills.mjs          # frontmatter, name=dir, required sections, no placeholders
node scripts/verify-manifests.mjs       # every plugin manifest parses as JSON with its required shape
node scripts/check-internal-links.mjs   # every internal markdown link resolves to a file
```

Because the web app renders `skills/` at build time (D-015), a failure here is a
docs build failure too. When adding a skill, also confirm it is listed in the
Skills table above, routed from `skills/haikei/SKILL.md`, and reflected in the
per-harness manifests (`plugin.json`, `.claude-plugin/`, `.codex-plugin/`,
`.cursor-plugin/`, `.agents/plugins/`) — the scripts check shape, not coverage.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Short version: skills document existing
behavior; the code wins; keep `SKILL.md` in the 130-340 line range; no
screenshots, no absolute paths, no invented APIs.

## License

MIT. See [LICENSE](LICENSE).
