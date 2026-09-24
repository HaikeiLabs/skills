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
| [kei-runtime-setup](skills/kei-runtime-setup/SKILL.md) | Stand up a customer-hosted runtime end to end: login, installation, credential to secret manager, `KEI_RUNTIME_*` env, `kei-proxy runtime bootstrap`/`heartbeat`, bind, and a fail-closed check |
| [kei-credential-rotation](skills/kei-credential-rotation/SKILL.md) | Rotate or revoke a runtime installation credential (`kei bot credential --rotate`, immediate cutover) and the console-only agent-key rotation |
| [kei-harness-setup](skills/kei-harness-setup/SKILL.md) | Connect Claude Code, Codex, OpenCode, Pi, or Cursor to Kei: install these skills, pair with a runtime, pass agent identity to `kei-proxy authorize`, prove denials |
| [kei-abac-api](skills/kei-abac-api/SKILL.md) | The ABAC HTTP API (`/api/v1/*`): organizations, workspaces, data connectors, groups, policies, users, invitations, agents, access levels, roles — where org management actually lives today |
| [kei-api-conventions](skills/kei-api-conventions/SKILL.md) | Resource-oriented (AIP-style) HTTP endpoint conventions from ADR-019: collection naming, `:verb` custom methods, pagination, the dual-write migration, and the `aipcheck` CI gate |
| [agentware-sdk](skills/agentware-sdk/SKILL.md) | The open-source agentware SDK: policy enforcement, audit records, and delegation for agent tool calls, in Go, Python, and TypeScript |
| [kei-agents](skills/kei-agents/SKILL.md) | Agent definitions, tool schemas, semantic mappings, and governed connector bindings from the `kei-agents` package |
| [kei-setup-doctor](skills/kei-setup-doctor/SKILL.md) | A diagnosis *workflow* (not a CLI command — there is no `kei setup doctor`) for Kei runtime installations across local, AWS, Azure, or other customer environments |
| [kei-assistant-security](skills/kei-assistant-security/SKILL.md) | The DVL Assistant (Kei) ingress boundary: fail-closed authentication, principal derivation, enrollment gates, pseudonymous audit, idempotency, and the governor pin — security invariants for the Teams/Bot Framework bot that must not be weakened |
| [kei-teams-ingress](skills/kei-teams-ingress/SKILL.md) | Microsoft Teams and Bot Framework integration: activity parsing, Connector JWT auth, SSO signin/tokenExchange, OAuthCards, mention/audience gate, reply routes, outbound Connector sends, the Teams app manifest, and both the assistant and the chat harness Teams adapter |
| [kei-tool-adapters](skills/kei-tool-adapters/SKILL.md) | Tool adapters and the governor tool-lane pattern: schema/client/guard/envelope/renderer/runtime stacks, GovernorClient proposals and stdio protocol, the typed tool-lane registry, and the chat harness's agent tools and tool-definition renderers |
| [kei-headless-evals](skills/kei-headless-evals/SKILL.md) | Headless, deterministic evaluation harnesses: EvalSuite/EvalCase/EvalTrace/EvalReport, ScriptedBackend, golden fixtures, the assistant CLI, and the chat harness and agentware eval harnesses |
| [kei-openai-backends](skills/kei-openai-backends/SKILL.md) | OpenAI-compatible LLM backend integration: LLM_ENDPOINT/LLM_MODEL wiring, pydantic-ai OpenAIChatModel, tool-definition format renderers, eval ModelBackend, and the Kei local docker stack |
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
