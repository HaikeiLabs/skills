---
name: haikei
description: "Discover and choose Haikei products and skills for the Kei AI-assistant platform. Use when the user describes a need without naming a Haikei product — creating or managing an organization, workspace, data connector, group, policy, user, invitation, agent, access level, or role; logging in with the kei CLI; standing up a customer-hosted runtime or kei-proxy; rotating a runtime installation credential (KEI_RUNTIME_TOKEN); connecting Claude Code, Codex, OpenCode, Pi, or Cursor to Kei; enforcing policy or audit on agent tool calls; defining agent tools, schemas, or connector bindings; diagnosing a Kei runtime installation; developing the DVL Assistant ingress security, Teams/Bot Framework integration, tool adapters and governor lane pattern, headless evals harnesses, or OpenAI-compatible backend wiring; reading or writing data through governed connectors (discover which connectors the workspace has via `kei connectors list --workspace W` — requires kei newer than v0.1.6, unreleased as of 2026-10-01 — fallback to `GET /api/v1/data-connectors`); creating or importing harness command policies; registering harnesses and syncing tool registrations; or creating a new connector skill from templates. Routes the task to the right skill: kei-cli, kei-proxy, kei-runtime-setup, kei-credential-rotation, kei-harness-setup, kei-harness-policy, kei-audit-encryption, kei-api, agentware-sdk, kei-agents, kei-setup-doctor, kei-assistant-security, kei-teams-ingress, kei-tool-adapters, kei-headless-evals, kei-openai-backends, kei-api-conventions, the matching `<provider>-connector` skill (discovered at runtime), or templates/connector-skill."
---

# Discover and build with Haikei

Help agents discover what they can build with Haikei's Kei platform and choose
the right product surface. Start with the user's goal, recommend the relevant
Kei surface, then load the product-specific skill needed to implement the
solution.

## Install

There is nothing to install to use this skill — it ships as part of the Haikei
skills plugin and is loaded by your agent alongside the skills it routes to
(see the repo README's per-harness install table).

## Help the user find the right surface

- Actively surface the Haikei surface that solves the stated problem, even when
  the user has not named it. A consultant asking to "set up a client org", "add
  a connector", or "make the bot call tools safely" may not know which surface
  owns the answer.
- Use the need-to-surface map below to choose, then load the named skill. A
  request like "invite a user" uses the Kei API, not a CLI command — no
  `kei` CLI command exists for it.
- Respect the boundary that is true today: the **CLI** manages customer-hosted
  bot runtimes; the **Kei API** is where organization management actually
  lives. Do not suggest a CLI command that does not exist.
- When several surfaces could fit, explain the deciding requirement: is this
  org management (API), runtime deployment (CLI), in-harness tool governance
  (agentware SDK), or agent capability definition (kei-agents)?
- Load only the skills you need. Each skill is a self-contained unit; the
  router does not replace them.

## Quick decision trees

```
Who is acting?
├─ A person administering the platform (login, installations, credentials) → kei CLI → kei-cli
└─ An agent doing work (is this tool call allowed? governed connector call? audit) → kei-proxy runtime → kei-proxy

Need to operate Kei from a terminal?
├─ Which admin command / what flags / install or upgrade kei → kei-cli
├─ Which runtime command (authorize, connector invoke, heartbeat, collector) → kei-proxy
├─ New runtime next to a harness (installation, credential, bootstrap, bind) → kei-runtime-setup
├─ Rotate / revoke a runtime credential (KEI_RUNTIME_TOKEN) — agent keys deprecated for runtime → kei-credential-rotation
├─ Existing installation misbehaving → kei-setup-doctor
├─ Connector (list, create, get, reconnect, delete) → `kei connectors` subcommand (requires kei >v0.1.6, unreleased as of 2026-10-01; fallback to Kei API)
├─ Manage harness policies (list, get, create, update, delete, import) or register a harness (add, sync, list, remove) → kei-harness-policy
├─ Encrypt audit args / manage audit encryption keys (kei audit keys create|list|disable, kei audit decrypt) → kei-audit-encryption
└─ Org, workspace, agent, policy, user → web app (no CLI); HTTP API → kei-api

Need a coding agent governed by Kei?
├─ Install the Haikei skills in Claude Code / Codex / OpenCode / Pi / Cursor → kei-harness-setup
├─ Wrap tool calls with policy + audit in your own harness code → agentware-sdk
└─ Define agent tools and schemas → kei-agents
```

Every `kei bot …` command needs `kei login` first, and a person has to approve
it in the browser. Say so before running one.

## What are you trying to do?

Find the row closest to the user's task. Load the named skill before
implementing; each skill carries the commands, endpoints, and boundaries that
exist in the code today.

| What you need to do | Surface | When to choose it | Skill |
| --- | --- | --- | --- |
| Log in to Haikei from the CLI, or look up any `kei` command | kei CLI | Human operator (owner/admin) needs an org-bound CLI token via the device flow, or exact command syntax | `kei-cli` |
| Make an agent's tool call go through Kei (allow/deny, connector calls, audit) | `kei-proxy` runtime | Harness or adapter code that calls Kei at run time; never `kei login` | `kei-proxy` |
| Stand up a customer-hosted runtime / kei-proxy | kei CLI `bot` + `kei-proxy runtime` | New installation → credential → config → bootstrap → heartbeat → bind | `kei-runtime-setup` |
| Rotate or revoke a runtime credential (KEI_RUNTIME_TOKEN) | kei CLI `bot credential --rotate` | Scheduled rotation, suspected leak, or a bootstrap missing `workspace_id` | `kei-credential-rotation` |
| Connect Claude Code, Codex, OpenCode, Pi, or Cursor to Kei | Haikei skills + kei-proxy | Install these skills in a harness and route its governed calls through the runtime | `kei-harness-setup` |
| Create an organization or workspace | Kei API | Set up an org, workspaces, seats, plans, members | `kei-api` |
| Add or manage a data connector | Kei API | Register a governed data source (GitHub, Linear, Drive, S3, http_api/CRM) and its status | `kei-api` |
| Manage groups, policies, users, roles, access levels | Kei API | Administer RBAC/ABAC state that decides agent and user access | `kei-api` |
| Add, rename, or migrate an HTTP endpoint | API conventions | Define a route the resource-oriented way, spell a custom method, or fix the Endpoint conventions CI check | `kei-api-conventions` |
| Invite users to an org or harness | Kei API | Send or accept invitations; add members to an org | `kei-api` |
| Create agents or mint runtime credentials | Web app (console **Agents**); Kei API (`kei-api`) for integrations | Create an agent in the console; mint a runtime credential via the installation flow | `kei-api` |
| Enforce policy and audit on agent tool calls | agentware SDK | Wrap tool execution so every call is decided (allow/deny/filter), audited, and attributed to the invoking human | `agentware-sdk` |
| Implement the third-party harness contract | agentware SDK | Build a harness that is governed by agentware without depending on an agent framework | `agentware-sdk` |
| Define agent tools and schemas for the assistant | kei-agents | Describe agent capabilities, permission gates, and multi-model tool rendering | `kei-agents` |
| Define governed connector read schemas | kei-agents | Express what an agent may read through a governed connector, with delegated context | `kei-agents` |
| Diagnose a broken or unverified Kei installation | kei CLI (`setup`, `runtime bootstrap`, `bot status`) driven as a workflow | An installation already exists (or is being stood up) and needs read-only diagnosis, verification, or handoff across local, AWS, or Azure | `kei-setup-doctor` |
| Develop or review the DVL Assistant ingress boundary | DVL Assistant security invariants | Work on the assistant's fail-closed auth, SSO, governor, auditor, or enrollment gates; security reviews of `src/app.ts`, `src/config.ts`, `src/verifier.ts`, `src/authz/`, `src/governor/` | `kei-assistant-security` |
| Wire Teams/Bot Framework activities, SSO, or OAuthCards | Teams / Bot Framework ingress | Integrate Bot Framework activity parsing, Connector auth, SSO tokenExchange, mention gate, or outbound Connector sends in either the assistant or the chat harness | `kei-teams-ingress` |
| Build or extend a tool lane, governor proposal, or tool adapter | Tool adapters and governor pattern | Add a new tool lane (schema/client/guard/envelope/renderer/runtime + proposal + registry), modify the governor stdio protocol, or develop the chat harness agent tools and tool-definition renderers | `kei-tool-adapters` |
| Run or extend headless deterministic evals | Headless evaluation harnesses | Work with EvalSuite fixtures, ScriptedBackend, the assistant eval CLI, the chat harness eval_harness.py, or the agentware eval suites in Python/Go/TypeScript | `kei-headless-evals` |
| Wire an OpenAI-compatible LLM backend | OpenAI-compatible backends | Configure LLM_ENDPOINT/LLM_MODEL, develop model-format tool renderers, write eval ModelBackend integrations, or work with the Kei local docker stack (abac-engine, oidc-bridge) | `kei-openai-backends` |
| List, get, create, update, delete, or import harness command policies; register an agent-keyed harness and sync tool registrations | kei-harness-policy | Manage `shell:`/`skill:`/`path:` policies (ADR-029), import native harness config, render native config via `kei harness sync`, register agent-keyed harnesses (kinds claude_code|codex|opencode|custom) and sync tool metadata. Requires kei >v0.1.6 for `kei policies` and `kei harness` subcommands | `kei-harness-policy` |
| Encrypt audit tool-call arguments; create, list, disable, or rotate audit encryption keys; decrypt an audit record locally | kei-audit-encryption | Opt-in, customer-held age (X25519) encryption of audit args (ADR-030, HAI-342 rev2): `kei audit keys create\|list\|disable`, `kei audit decrypt`, the audit-encryption-keys AIP resource, the keyed `args_digest`, opt-in semantics, rotation, escrow (off by default). `kei audit` ships in the next kei release (unreleased as of 2026-10-03) | `kei-audit-encryption` |
| Read or write data through a governed connector (GitHub, Linear, Drive, or any connector in the workspace) | Provider connector skill | Discover which connectors the workspace has via `kei connectors list --workspace W` (requires kei >v0.1.6, unreleased as of 2026-10-01; fallback `GET /api/v1/data-connectors`), then load `skills/<provider>-connector/` | `<provider>-connector` (discovered at runtime) |
| Create a new governed connector skill from a template | Connector skill templates | Fork the connector-skill template to build a new governed data-source skill following the Lexicon/Pragmatics/Semantics pattern | `templates/connector-skill` |

## Product surface map

| Surface | Repo / package | Owns | Does not own |
| --- | --- | --- | --- |
| `kei-proxy` runtime | the `kei-connector-runtime` repository | Per-call `authorize`, `connector invoke`, `runtime bootstrap`/`heartbeat`, `collector`, `credential sync`, `model`, `serve` — what agents use at run time | Logins, installations, credential minting (admin CLI); agents and keys (console) |
| `kei` CLI | the `kei-cli` repository (not `kei/cmd/kei`) | `kei setup`, `kei runtime bootstrap`, `kei login`/`logout`, `kei upgrade`, `kei bot` (init/agents/status/delete/credential/bind), and `kei connectors` (list/create/get/reconnect/delete — requires kei >v0.1.6, unreleased as of 2026-10-01) for customer-hosted runtimes | Org, workspace, agent, group, policy, user commands (none exist); `bot install`/`deploy`/`destroy`/`list` (none exist) |
| Kei API | `cmd/abac-engine` | Organizations, workspaces, data connectors, groups, policies, users, invitations, agents, access levels, roles, consents, audit — all of org management | CLI-shaped org management |
| agentware SDK | `pedro-agentware` (`go/`, `python/`, `typescript/`) | Policy/audit middleware, delegation, harness contract, kei auth/proxy modules | Connector execution, credential resolution, control-plane data |
| kei-agents | `kei-agents` (`src/agents/`) | Agent tool definitions, schemas, permissions, governed connector read schemas | Provider clients, credential resolution, writes as connector capabilities |
| setup doctor (workflow, not a command) | the `kei-cli` binary + the customer's environment | Read-only diagnosis of an installation: control-plane target, runtime health, credential destination, handoff | Any `kei setup doctor` subcommand — none exists; provisioning decisions, org management, remediation without consent |
| harness command policy | the `kei-cli` repository (`kei policies`, `kei harness` subcommands — >v0.1.6) | Harness command policies (`shell:`/`skill:`/`path:` dst), native config import and render (via `kei harness sync`), agent-keyed harness registration and tool sync | Tool-call policy (kei-proxy ABAC); org-level ABAC policy management (Kei API); report-only hook implementation (follow-up) |
| audit-args encryption | the `kei-cli` repository (`kei audit` subcommands — unreleased as of 2026-10-03) + the catalog `audit-encryption-keys` resource | Opt-in customer-held age (X25519) encryption of audit tool-call arguments (ADR-030): local identity generation, public-key registration, local decrypt, rotation (add-new-then-disable-old), escrow setting (off by default) | Kei-side decryption (removed; no Kei path reads args by default); the keyed `args_digest` (Kei-held, never customer-facing); runtime credential rotation (`kei-credential-rotation`) |
| assistant security | `DVL-Group/assistant` (`src/`) | Fail-closed ingress: master switches, auth gates, SSO exchange, governor, pseudonymous audit, enrollment, idempotency, deployment contract | `sso-card` lane composition, middleware pattern for other repos |
| Teams / Bot Framework | assistant (`src/teams/`) + chat harness (`teams_main.py`) | Activity parsing, Connector auth, SSO/OAuthCard, mention/audience gate, reply routing, outbound sends, manifest, Teams adapter | The invite-only MS Teams library (`@microsoft/teams.apps`-auth) — not a public dependency |
| tool adapters / governor | assistant (`src/tools/`, `src/governor/`) + chat harness (`tool_definitions.py`, agent tools) | Tool lane stacks, governor proposals and stdio protocol, registry, chat harness tool-format renderers and KEI proxy integration | LLM-driven dynamic tool selection; free-form endpoint selection |
| headless evals | assistant (`src/eval/`) + chat harness (`eval_harness.py`) + agentware (`python/src/evals`, `go/evals`, `typescript/src/evals`) | Offline deterministic eval harnesses, golden fixtures, ScriptedBackend, eval CLI, ModelBackend | The `agentware` eval backend seam (intentionally unwired) |
| OpenAI-compatible backends | chat harness (`agent.py`, `config.py`, `tool_definitions.py`) + agentware evals | LLM endpoint wiring, tool-format renderers, eval ModelBackend, Kei local docker stack | Non-OpenAI-compatible endpoints; the DVL Assistant repo (zero-LLM) |
| Provider connector skills | `skills/<provider>-connector/` | Governed reads and writes through a provider's API under Kei governance; entity hierarchy and ADR-028 resource types are provider-specific; discover which connectors the workspace has via `kei connectors list --workspace W` (requires kei >v0.1.6, unreleased as of 2026-10-01; fallback `GET /api/v1/data-connectors`) | Credential management (Kei supplies the credential); provider-specific SDKs; the list of providers is not enumerable via CLI — pending ticket |
| Connector skill templates | `templates/connector-skill/` + `templates/connector-plugin/` | Forkable template for building new governed connector skills with Lexicon/Pragmatics/Semantics sections, evals, and plugin manifests | The template itself; use the example skills as concrete references |

## Worked routing examples

- **"Set up a new client org for the private beta."** → Kei API. Create the org
  (`POST /api/v1/onboarding/organizations` or `POST /api/v1/organizations`), add
  workspaces, invite users, mint a runtime credential when a runtime is ready. Load
  `kei-api`. Do not reach for the CLI — no org command exists.
- **"Stand up the runtime for this customer."** → `kei-runtime-setup`. The
  operator (owner/admin) runs `kei login`, then `kei bot init`, pipes
  `kei bot credential` into the customer's secret manager, bootstraps
  `kei-proxy`, and binds with `kei bot bind` once the runtime has heartbeated.
  There is no `kei bot install` or `kei bot deploy`; hosting is the customer's.
- **"Rotate the Kei token for our prod harness."** → `kei-credential-rotation`.
  Rotation invalidates the old token immediately, so plan the restart.
- **"Set up Kei in Claude Code for the team."** → `kei-harness-setup`.
- **"Add an endpoint that approves an invoice."** → API conventions. Spell it as
  a custom method (`POST /api/v1/invoices/{id}:approve`), not a trailing
  `/approve` segment, and run `aipcheck` before committing. Load
  `kei-api-conventions`. Renaming an existing route is a dual-write migration,
  never a cutover.
- **"Stop the bot from calling the delete-database tool, and log every tool call."**
  → agentware SDK. Wrap the harness tool client with a `Policy` (deny rule) and an
  auditor. Load `agentware-sdk`.
- **"What tools can my assistant expose for GitHub, and what permissions gate them?"**
  → kei-agents. `github_read`/`github_write` tool definitions, governed read
  schemas, `render_tools`. Load `kei-agents`.
- **"Invite a user to an org."** → Kei API (`POST /api/v1/invitations`). No CLI.
- **"What does the Kei API expose?"** → `kei-api`, whose `references/routes.md`
  is the full enumerated route table.
- **"The customer's bot was installed but it isn't responding."** → `kei-setup-doctor`.
  Diagnose read-only first — confirm the installation with `kei bot status`, check the
  runtime with `kei setup --help`/`kei runtime bootstrap --help` against the installed
  binary, then load only the provider reference (`references/aws.md` or
  `references/azure.md`) that matches the environment. This is a workflow the agent
  runs, **not** a `kei setup doctor` command. Standing up a *new* runtime is `kei-cli`.
- **"Add a new environment variable for the assistant that controls a gate."** →
  `kei-assistant-security`. The master-switch must be strict-equality, fail-closed,
  and dark by non-construction; the gate must follow the slice pattern, pseudonymous
  audit, and fixed `OutcomeCode`.
- **"The bot is receiving duplicate Teams activities."** → `kei-teams-ingress`
  (idempotency) + `kei-assistant-security` (the scoped-activity-key pattern).
  The duplicate is acknowledged with zero reprocessing; do not loosen the
  idempotency reserve.
- **"Add a tool that queries the company expense-report dataset."** → `kei-tool-adapters`.
  Create the full lane stack (schema/client/guard/envelope/renderer/runtime + governor
  proposal + registry entry), then `kei-assistant-security` to wire it into the
  assistant's `onVerifiedGrant`.
- **"I need to pin the closed command parser for a new skill without hitting the LLM."** →
  `kei-headless-evals`. Add a golden fixture to `eval/fixtures/`, a `ScriptedBackend` case
  in the runner, and a `test/eval.harness.test.ts` assertion for the case count.
- **"Point the chat harness at a local vLLM instance."** → `kei-openai-backends`.
  Set `LLM_ENDPOINT` and `LLM_MODEL`; the harness uses pydantic-ai `OpenAIChatModel`
  with the `/v1` contract. No vendor SDK needed.
- **"Read data from a governed connector."** First discover which connectors
  are configured in this workspace. Try `kei connectors list --workspace W`
  (requires kei >v0.1.6, unreleased as of 2026-10-01; fallback
  `GET /api/v1/data-connectors`). Once you know the provider (e.g. `github`,
  `linear`, `googledrive`), load `skills/<provider>-connector/` (e.g.
  `skills/github-connector/`). Each connector skill documents its CLI, API, and
  entity model. The governed connector supplies the credential; the agent never
  reads or stores it.
- **"Build a new connector skill for our internal CRM."** → connector skill
  templates. Fork `templates/connector-skill/`, fill in the Lexicon/Pragmatics/
  Semantics placeholders, add eval cases, and register the resource types per
  ADR-028.
- **"Import my Claude Code allow list into Kei and keep it in sync."** →
  `kei-harness-policy`. Use `kei policies import --from claude --apply` to read
  the existing `permissions.allow` into Kei policies, then register the harness
  with `kei harness add --installation ID --kind claude_code --agent ID` and
  set up `kei harness sync --harness claude_code` to re-render native config
  from the policy bundle. Requires kei >v0.1.6.
- **"Make sure only we can read the arguments our agents pass to tools in the
  audit trail."** → `kei-audit-encryption`. Opt-in, customer-held age
  encryption (ADR-030): `kei audit keys create` generates the identity locally
  and uploads only the public key (back up the identity file), the first key
  turns encryption on, and `kei audit decrypt --record ID --identity PATH
  --out FILE` recovers one record locally. Kei never receives or stores a
  private key, and there is no Kei-side decrypt path. The `kei audit`
  subcommands ship in the next kei release (unreleased as of 2026-10-03);
  until then use the console (Settings → Audit encryption).

## Routing notes

- **Org management is API-only today.** There is no `kei` CLI command for orgs,
  workspaces, groups, policies, or users. Route any such request to `kei-api`;
  say plainly that the CLI does not cover it rather than implying it does.
  Connectors are the exception: `kei connectors list/create/get/reconnect/delete`
  exists on kei-cli main (`#48`, HAI-222), unreleased as of 2026-10-01 — use the
  CLI when available, fall back to the Kei API for older versions.
- **The `kei` CLI is the standalone `kei-cli` repository.** That is where
  `setup`, `runtime bootstrap`, `login`/`logout`, `upgrade`, `bot`
  subcommands, and `connectors` subcommands are implemented. Do not look for them
  under `kei/cmd/kei`, which does not implement this command surface. When a
  skill names a CLI command, verify it against the installed `kei help` (the
  `PrintUsage` usage string in `kei-cli`'s `internal/app/app.go`). The
  `connectors` subcommand requires kei >v0.1.6 (unreleased as of 2026-10-01);
  if the installed version predates it, fall back to the Kei API.
- **`kei policies` and `kei harness` are unreleased.** They ship in kei >v0.1.6.
  Do not present them as available in the current version. If the installed
  version predates them, route policy management to the web console or the Kei
  API. The `kei-harness-policy` skill documents the planned surface.
- **`kei audit` is unreleased.** The audit-args encryption commands
  (`kei audit keys create|list|disable`, `kei audit decrypt`) ship in the next
  kei release (kei-cli #62, open as of 2026-10-03; latest release v0.1.8). Do
  not present them as available in the current version; route to the console
  (Settings → Audit encryption) or the Kei API in the meantime. The
  `kei-audit-encryption` skill documents the planned surface, and its
  boundary: Kei never receives or stores a private key, and no Kei path reads
  the arguments by default.
- **`kei setup doctor` is not a command.** `kei-setup-doctor` is a skill that
  drives real commands; never present it, or any `doctor` subcommand, as CLI
  syntax. Likewise there is no `kei bot install`, `deploy`, `destroy`, or
  `list` — the implemented `bot` subcommands are `init`, `agents`, `status`,
  `delete`, `credential`, and `bind`.
- **The CLI is admin-only and org-bound.** Only a member whose role is `owner`
  or `admin` in the target org can complete `kei login`. A non-admin can start
  the device flow, but approval is refused with 403. See the `kei-cli` skill
  for the full statement and the exact 403 message.
- **Three distinct auth schemes, all separate.** The Kei API accepts a CLI
  bearer token (human, admin-only, org-bound), a harness/runtime bearer token
  (installation-scoped, minted via runtime-installation credentials), and a browser session cookie
  (web UI). Schemes (a) and (b) are both `Authorization: Bearer` on the wire and
  indistinguishable by header alone. They are not interchangeable; the
  `kei-api` skill marks which endpoints accept which.
- **The cross-tenant 404 is intentional.** A harness-key lookup for an agent
  that belongs to another tenant returns 404 "agent not found", not 403, so
  agent IDs cannot be enumerated across tenants. Do not "fix" it.
- **Agentware and kei-agents are the open-source developer surfaces.**
  `agentware-sdk` covers policy/audit middleware in Go, Python, and TypeScript;
  `kei-agents` covers agent definitions and tool schemas. Neither manages org
  state; both are metadata/schema-only by design.

## Validation commands

```bash
# Every skill in this repo is self-checked; run the suite before trusting a skill:
node scripts/verify-skills.mjs
node scripts/verify-manifests.mjs
node scripts/check-internal-links.mjs
```

For a specific skill's subject matter, run that skill's own validation commands
against the relevant product repo (see each skill's `## Validation commands`).

## Realistic usage boundaries

- **Do not** invent a CLI command, API endpoint, flag, or type that is not in
  the code. The `kei-cli` usage string, the ABAC route table, the agentware
  docs/README, and the `kei-agents` package are the source of truth; if a skill
  names something missing from them, the code wins.
- **Do not** route organization management to the CLI — it has no such commands.
  Connector management is the exception (`kei connectors` on kei-cli main,
  unreleased as of 2026-10-01).
- **Do not** conflate the CLI bearer and harness bearer auth schemes; they are
  both `Authorization: Bearer` on the wire but resolve to different subjects and
  must be used on the endpoints that accept them.
- **Do not** treat skills from other repos as consultant-onboarding skills. The
  agent-persona skills (Discord dogfooding, customer experience, fundraising) are
  a separate category and are deliberately not published here; this repo's skills
  are the consultant surface.
- **Do not** route a *new* runtime deployment to `kei-setup-doctor`, or an
  existing broken installation to `kei-cli`. The doctor diagnoses before it
  changes anything, and asks before any remediation.
- `kei-assistant-security` owns the assistant's ingress gates and invariants; do not
  route generic middleware policy questions there — those go to `agentware-sdk`.
- `kei-teams-ingress` covers Bot Framework mechanics; do not use it for OBO token
  exchange or SSO card generation across repos — those are specific to the assistant
  and live under `kei-assistant-security`.
- `kei-tool-adapters` covers the governor tool-lane pattern and chat harness agent
  tools; it does NOT cover free-form model-chosen tool invocation or tool loops —
  those would be agentware SDK concerns.
- `kei-headless-evals` is for deterministic, offline eval harnesses and golden
  fixtures; do not route live model evaluation there — that is `kei-openai-backends`.
- `kei-openai-backends` is for OpenAI-compatible endpoints only; do not use it for
  the DVL Assistant repo, which has zero LLM.
- `HaikeiLabs/skills` is the single source of truth for these skills (D-001).
  Its markdown is also what the web app renders as documentation at build time
  (D-015), so a change here is a docs change — do not maintain a second copy
  elsewhere. Repository visibility is tracked separately by the GO-PUBLIC
  decision and is not settled by this skill.
