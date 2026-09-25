# Haikei Skills

A collection of [Agent Skills](https://agent-skills.io/) for building and
operating AI assistants with Haikei's Kei platform: the **Kei API** for
documented platform resources, the **kei CLI** for customer-hosted runtimes,
the **Agentware SDK** for policy and audit on agent tool calls, and the
**kei-setup-doctor** for diagnosing runtime installations.

## Source of truth

This repository contains the public, portable skills for supported Haikei
developer and operator workflows. Product-specific internal engineering
guides are excluded from the public skills and plugin catalogs.

This audit removed the assistant ingress security guide, assistant-specific
Teams adapter details, private tool-lane implementation guide, repository
specific evaluation harnesses, and private chat-harness backend guide. Those
materials documented internal source layouts, security gates, or deployment
and testing workflows rather than supported public developer workflows. The
public Teams and model-provider ecosystems remain available through their
upstream documentation; public Kei integration guidance stays in the runtime,
API, and SDK skills.

Contributor guidelines:

- Keep skills aligned with supported public workflows and public documentation.
- Do not include screenshots, internal source paths, private installation
  details, or undocumented endpoints in public skill content.

## Installing

### Copyable setup prompt

Paste this prompt into the coding agent you want to configure. It tells the
agent to fetch the repository and install the same portable skill folders for
the harness it is running in:

```text
Install the Haikei Agent Skills from https://github.com/HaikeiLabs/skills.git.
First inspect which harness you are running (Claude Code, Cursor, OpenCode,
Pi, or Codex) and its documented user/project skill directory. Clone the
repository to a temporary directory, review the skills/ folders, then copy or
symlink each folder containing SKILL.md into that harness's skill directory.
Preserve existing skills, do not overwrite a same-named skill without asking,
and do not copy .git metadata. After installation, verify that all SKILL.md
files have name and description frontmatter and report the destination and
the installed skill names. Do not print secrets or modify project files
outside the selected skill directory.
```

The prompt is intentionally harness-neutral: the agent must discover its
actual runtime and use its own supported install path instead of assuming
that a path for another harness is valid.

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

### Pi

Pi loads the same Agent Skills directories. Clone this repo and either add
the repository's `skills/` directory to `~/.pi/agent/skills/`, or configure
the clone in Pi's settings:

```json
{
  "skills": ["/path/to/skills/skills"]
}
```

For a project-local install, use `.pi/skills/` or configure the repository's
`skills/` directory in `.pi/settings.json`. Pi also discovers the skills
through `~/.agents/skills/` and project `.agents/skills/` directories.

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
| Pi | `~/.pi/agent/skills/` or `~/.agents/skills/` | [docs](https://pi.dev/docs/latest/skills) |
| Codex | `~/.codex/skills/` | [docs](https://developers.openai.com/codex/skills/) |

## Skills

Skills are contextual and auto-loaded based on your conversation. When a request
matches a skill's trigger description, the agent loads and applies the relevant
skill.

| Skill | Useful for |
|-------|------------|
| [haikei](skills/haikei/SKILL.md) | Router: "what are you trying to build?" maps a need to the right Haikei product and the skill to load |
| [kei-cli](skills/kei-cli/SKILL.md) | The `kei` CLI (standalone `kei-cli` repo): `setup`, `runtime bootstrap`, `login`/`logout` (OIDC device flow, admin-only, org-bound), `upgrade`, and `bot init/credential/agents/status/bind/delete` for customer-hosted runtimes |
| [kei-proxy](skills/kei-proxy/SKILL.md) | The `kei-proxy` runtime agents use at run time: `authorize` per tool call (exit codes, JSON, `KEI_PROXY_*` identity), `connector invoke`, `runtime bootstrap`/`heartbeat`, `collector`, `serve` — and how it differs from the `kei` admin CLI |
| [kei-runtime-setup](skills/kei-runtime-setup/SKILL.md) | Stand up a customer-hosted runtime end to end: login, installation, credential to secret manager, `KEI_RUNTIME_*` env, `kei-proxy runtime bootstrap`/`heartbeat`, bind, and a fail-closed check |
| [kei-credential-rotation](skills/kei-credential-rotation/SKILL.md) | Rotate or revoke a runtime installation credential (`kei bot credential --rotate`, immediate cutover) and the console-only agent-key rotation |
| [kei-harness-setup](skills/kei-harness-setup/SKILL.md) | Connect Claude Code, Codex, OpenCode, Pi, or Cursor to Kei: install these skills, pair with a runtime, pass agent identity to `kei-proxy authorize`, prove denials |
| [kei-api](skills/kei-api/SKILL.md) | Use the Kei API to manage organizations, workspaces, data connectors, groups, policies, users, invitations, agents, access levels, and roles |
| [kei-api-conventions](skills/kei-api-conventions/SKILL.md) | Design public resource-oriented endpoints, custom actions, pagination, update masks, and stable API errors |
| [agentware-sdk](skills/agentware-sdk/SKILL.md) | Agentware policy enforcement and audit middleware for agent tool calls |
| [kei-agents](skills/kei-agents/SKILL.md) | Define agent capabilities, tool schemas, permission gates, and governed connector read capabilities |
| [kei-setup-doctor](skills/kei-setup-doctor/SKILL.md) | A diagnosis *workflow* (not a CLI command — there is no `kei setup doctor`) for Kei runtime installations across local, AWS, Azure, or other customer environments |
## What is deliberately absent

- **No CLI commands that do not exist.** The `kei` CLI — the standalone
  `kei-cli` repository, not `kei/cmd/kei` — exposes `setup`, `runtime
  bootstrap`, `login`, `logout`, `upgrade`, and `bot` (`init`, `credential`,
  `agents`, `status`, `delete`, `bind`). There are no `org`, `workspace`,
  `connector`, `group`, `policy`, or `user` commands; org management is done
  through the Kei API (see the `kei-api` skill). There is also no
  `bot install`, `bot deploy`, `bot destroy`, `bot list`, or `kei setup doctor`
  — the setup doctor is a skill workflow, not a subcommand. This repo never
  invents a command that is not in the CLI's usage string.
- **No absolute local paths.** Every reference is product-name- and
  repo-relative so the repo can be published as-is.
- **No private distribution instructions.** Public skills describe supported
  developer workflows and link only to public installation sources.

## Validation

The suite is self-checking and is enforced by CI (`.github/workflows/ci.yml`,
Node 22) on every pull request and on pushes to `main`. Run all three before
opening a PR:

```bash
node scripts/verify-skills.mjs          # frontmatter, name=dir, required sections, no placeholders
node scripts/verify-manifests.mjs       # every plugin manifest parses as JSON with its required shape
node scripts/check-internal-links.mjs   # every internal markdown link resolves to a file
node scripts/verify-evals.mjs           # every skill has portable Aspire-style eval cases
```

The checks above don't call a model. To see whether a skill actually changes
agent behavior, run its evals with and without the skill (needs the harness
CLI logged in; not run in CI):

```bash
node scripts/run-evals.mjs --skill kei-cli                  # one skill, Claude Code
node scripts/run-evals.mjs --harness codex                  # every skill, Codex
node scripts/run-evals.mjs --grade-only evals-out/<run>     # re-grade saved answers
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
