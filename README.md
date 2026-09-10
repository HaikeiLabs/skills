# Haikei Skills

A collection of [Agent Skills](https://agent-skills.io/) for building and
operating AI assistants with Haikei's Kei platform: the **ABAC API** for
organization management, the **kei CLI** for customer-hosted bot runtimes, the
**agentware SDK** for policy and audit on agent tool calls, and **kei-agents**
for agent definitions and tool schemas.

> **Status: draft.** This repository is being built in a local draft workspace.
> Its name, owner org, visibility, and license are **pending a decision** (STOP B).
> Everything here references the placeholder org/repo `HaikeiLabs/skills`; nothing
> has been pushed or published. Never add a remote to this checkout.

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
| [kei-cli](skills/kei-cli/SKILL.md) | The `kei` deployment CLI: `login` (OIDC device flow, admin-only, org-bound) and `bot init/install/agents/deploy/status/destroy` for customer-hosted runtimes |
| [kei-abac-api](skills/kei-abac-api/SKILL.md) | The ABAC HTTP API (`/api/v1/*`): organizations, workspaces, data connectors, groups, policies, users, invitations, agents, access levels, roles — where org management actually lives today |
| [agentware-sdk](skills/agentware-sdk/SKILL.md) | The open-source agentware SDK: policy enforcement, audit records, and delegation for agent tool calls, in Go, Python, and TypeScript |
| [kei-agents](skills/kei-agents/SKILL.md) | Agent definitions, tool schemas, semantic mappings, and governed connector bindings from the `kei-agents` package |

## What is deliberately absent

- **No CLI commands that do not exist.** The `kei` CLI exposes only `login` and
  `bot` today. There are no `org`, `workspace`, `connector`, `group`, `policy`,
  or `user` commands. Org management is done through the ABAC API (see the
  `kei-abac-api` skill). This repo never invents a command that is not in the
  CLI's usage string.
- **No absolute local paths.** Every reference is product-name- and
  repo-relative so the repo can be published as-is.

## Validation

The suite is self-checking and is enforced by CI:

```bash
node scripts/verify-skills.mjs          # frontmatter, name=dir, required sections, no placeholders
node scripts/verify-manifests.mjs       # every plugin manifest parses as JSON with its required shape
node scripts/check-internal-links.mjs   # every internal markdown link resolves to a file
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Short version: skills document existing
behavior; the code wins; keep `SKILL.md` in the 130-340 line range; no
screenshots, no absolute paths, no invented APIs.

## License

MIT. See [LICENSE](LICENSE).
