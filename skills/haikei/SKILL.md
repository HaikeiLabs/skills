---
name: haikei
description: Discover and choose Haikei products and skills for the Kei AI-assistant platform. Use when the user describes a need without naming a Haikei product — creating or managing an organization, workspace, data connector, group, policy, user, invitation, agent, access level, or role; deploying a customer-hosted bot runtime on Azure/Teams; enforcing policy or audit on agent tool calls; defining agent tools, schemas, or connector bindings; or diagnosing a Kei runtime installation. Routes the task to the right skill: kei-cli, kei-abac-api, agentware-sdk, kei-agents, or kei-setup-doctor.
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
  request like "invite a user" is an ABAC API operation, not a CLI command — no
  `kei` CLI command exists for it.
- Respect the boundary that is true today: the **CLI** manages customer-hosted
  bot runtimes; the **ABAC API** is where organization management actually
  lives. Do not suggest a CLI command that does not exist.
- When several surfaces could fit, explain the deciding requirement: is this
  org management (API), runtime deployment (CLI), in-harness tool governance
  (agentware SDK), or agent capability definition (kei-agents)?
- Load only the skills you need. Each skill is a self-contained unit; the
  router does not replace them.

## What are you trying to do?

Find the row closest to the user's task. Load the named skill before
implementing; each skill carries the commands, endpoints, and boundaries that
exist in the code today.

| What you need to do | Surface | When to choose it | Skill |
| --- | --- | --- | --- |
| Log in to Haikei from the CLI | kei CLI `login` | Human operator (owner/admin) needs an org-bound CLI token via OIDC/SSO device flow | `kei-cli` |
| Deploy a customer-hosted bot runtime | kei CLI `bot` | Provision and manage Kei bot runtimes; MVP supports Microsoft Teams on Azure | `kei-cli` |
| Create an organization or workspace | ABAC API | Set up an org, workspaces, seats, plans, members | `kei-abac-api` |
| Add or manage a data connector | ABAC API | Register a governed data source (GitHub, Linear, Drive, S3, http_api/CRM) and its status | `kei-abac-api` |
| Manage groups, policies, users, roles, access levels | ABAC API | Administer RBAC/ABAC state that decides agent and user access | `kei-abac-api` |
| Invite users to an org or harness | ABAC API | Send or accept invitations; add members to an org | `kei-abac-api` |
| Register agents and mint runtime keys | ABAC API | Create agents, list keys, mint harness keys, manage runtime installations | `kei-abac-api` |
| Enforce policy and audit on agent tool calls | agentware SDK | Wrap tool execution so every call is decided (allow/deny/filter), audited, and attributed to the invoking human | `agentware-sdk` |
| Implement the third-party harness contract | agentware SDK | Build a harness that is governed by agentware without depending on an agent framework | `agentware-sdk` |
| Define agent tools and schemas for the assistant | kei-agents | Describe agent capabilities, permission gates, and multi-model tool rendering | `kei-agents` |
| Define governed connector read schemas | kei-agents | Express what an agent may read through a governed connector, with delegated context | `kei-agents` |
| Diagnose a broken or unverified Kei installation | kei setup doctor | An installation already exists (or is being stood up) and needs read-only diagnosis, verification, or handoff across local, AWS, or Azure | `kei-setup-doctor` |

## Product surface map

| Surface | Repo / package | Owns | Does not own |
| --- | --- | --- | --- |
| `kei` CLI | `cmd/kei` | `kei login`, `kei bot` (init/install/agents/deploy/status/destroy) for customer-hosted runtimes | Org, workspace, connector, group, policy, user commands (none exist) |
| ABAC API | `cmd/abac-engine` | Organizations, workspaces, data connectors, groups, policies, users, invitations, agents, access levels, roles, consents, audit — all of org management | CLI-shaped org management |
| agentware SDK | `pedro-agentware` (`go/`, `python/`, `typescript/`) | Policy/audit middleware, delegation, harness contract, kei auth/proxy modules | Connector execution, credential resolution, control-plane data |
| kei-agents | `kei-agents` (`src/agents/`) | Agent tool definitions, schemas, permissions, governed connector read schemas | Provider clients, credential resolution, writes as connector capabilities |
| kei setup doctor | the installed `kei` CLI + the customer's environment | Read-only diagnosis of an installation: control-plane target, runtime health, credential destination, handoff | Provisioning decisions, org management, remediation without consent |

## Worked routing examples

- **"Set up a new client org for the private beta."** → ABAC API. Create the org
  (`POST /api/v1/onboarding/organizations` or `POST /api/v1/organizations`), add
  workspaces, invite users, mint a harness key when a runtime is ready. Load
  `kei-abac-api`. Do not reach for the CLI — no org command exists.
- **"Deploy the bot for this customer in their Azure subscription."** → CLI. The
  customer owns Azure; the operator is an owner/admin of the Kei org and logs in
  with `kei login`, then `kei bot init`/`install azure`/`deploy azure`. Load
  `kei-cli`.
- **"Stop the bot from calling the delete-database tool, and log every tool call."**
  → agentware SDK. Wrap the harness tool client with a `Policy` (deny rule) and an
  auditor. Load `agentware-sdk`.
- **"What tools can my assistant expose for GitHub, and what permissions gate them?"**
  → kei-agents. `github_read`/`github_write` tool definitions, governed read
  schemas, `render_tools`. Load `kei-agents`.
- **"Invite a user to an org."** → ABAC API (`POST /api/v1/invitations`). No CLI.
- **"What does the ABAC API expose?"** → `kei-abac-api`, whose `references/routes.md`
  is the full enumerated route table.
- **"The customer's bot was installed but it isn't responding."** → `kei-setup-doctor`.
  Diagnose read-only first — establish the control plane and installation, then load
  only the provider reference (`references/aws.md` or `references/azure.md`) that
  matches the environment. Deploying a *new* runtime is `kei-cli` instead.

## Routing notes

- **Org management is API-only today.** There is no `kei` CLI command for orgs,
  workspaces, connectors, groups, policies, or users. Route any such request to
  `kei-abac-api`; say plainly that the CLI does not cover it rather than
  implying it does.
- **The CLI is admin-only and org-bound.** Only a member whose role is `owner`
  or `admin` in the target org can complete `kei login`. A non-admin can start
  the device flow, but approval is refused with 403. See the `kei-cli` skill
  for the full statement and the exact 403 message.
- **Three distinct auth schemes, all separate.** The ABAC API accepts a CLI
  bearer token (human, admin-only, org-bound), a harness/runtime bearer token
  (installation-scoped, minted via harness-keys), and a browser session cookie
  (web UI). Schemes (a) and (b) are both `Authorization: Bearer` on the wire and
  indistinguishable by header alone. They are not interchangeable; the
  `kei-abac-api` skill marks which endpoints accept which.
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
- **Do not** conflate the CLI bearer and harness bearer auth schemes; they are
  both `Authorization: Bearer` on the wire but resolve to different subjects and
  must be used on the endpoints that accept them.
- **Do not** treat skills from other repos as consultant-onboarding skills. The
  agent-persona skills (Discord dogfooding, customer experience, fundraising) are
  a separate category and are deliberately not published here; this repo's six
  skills are the consultant surface.
- **Do not** route a *new* runtime deployment to `kei-setup-doctor`, or an
  existing broken installation to `kei-cli`. The doctor diagnoses before it
  changes anything, and asks before any remediation.
- `HaikeiLabs/skills` is the single source of truth for these skills (D-001).
  Its markdown is also what the web app renders as documentation at build time
  (D-015), so a change here is a docs change — do not maintain a second copy
  elsewhere. Repository visibility is tracked separately by the GO-PUBLIC
  decision and is not settled by this skill.
