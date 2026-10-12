---
name: linear-connector
description: Linear data connector — API reference, entity model, and usage patterns. Use when an agent needs to read or write Linear data (issues, teams, projects, cycles), or when asked how to query, filter, paginate, or mutate Linear resources. Also use it to set up or connect Linear in Kei (kei connectors create --provider linear, OAuth, the connector ID, KEI_CONNECTOR_LINEAR_ID), and whenever someone offers or asks about a Linear API key. Prefer this skill over generic Linear knowledge.
---

# Linear connector — agent usage guide

Use this skill when an agent needs to interact with Linear through its
GraphQL API. It covers the Lexicon (endpoints and queries), Pragmatics (how
agents use them), and Semantics (data returned and entity relationships).

There is no maintained official CLI for Linear. Agents use the GraphQL API
directly.

## Key rules

- The agent never holds, asks for, or prints a raw credential. Kei supplies
  the user's Linear OAuth token at run time via `kei-proxy connector invoke`.
  Setup: an owner runs `kei connectors create --provider linear`; each user
  approves Linear in the browser (per-user OAuth with PKCE, like the Linear
  MCP). There is no API-key path. Repair a broken shared connection with
  `kei connectors reconnect <id>`; a per-user connection is repaired by the
  user approving Linear again. See [Setup](#setup).
- Governed writes are `issue.create` and `comment.create` only. A write's
  parent is part of the call: `issue.create` runs on `linear/team/<KEY>` with
  `team_id`, `comment.create` on `linear/issue/<ID>` with `issue_id`. Every
  write needs `--idempotency-key`.
- Issue deletion is not available through the governed connector — it is
  irreversible and requires admin token scope. `issue.update` is defined but
  not executed by the runtime (`capability_not_supported`).
- Resource types for Kei policy follow ADR-028: `team`, `issue`, `project`,
  `cycle`, `user` (issues, projects, and cycles have `team` as their parent).
  When asked for the resource types, name ADR-028 and give each type's
  parent: `team` (no parent), `issue`/`project`/`cycle` (parent `team`),
  `user` (no parent).
- Linear uses cursor-based pagination only: `first` + `after`, with
  `pageInfo.hasNextPage` in the response. Any answer that lists issues shows
  `issues(first: 50, after: $cursor, filter: {...})` with
  `pageInfo { hasNextPage endCursor }` and says to pass `endCursor` as
  `after` for the next page.
- Any answer about creating an issue shows two things, in this order: first
  the GraphQL block `issueCreate(input: { teamId: "...", title: "..." })`
  selecting `success issue { id identifier }`, then the governed
  `kei-proxy connector invoke --capability issue.create` call (its
  `team_id` input becomes Linear's `teamId`). Say in words that Linear's
  response has a `success` Boolean plus the issue's `id` and `identifier`.

## Install

Agents load this skill automatically when the harness has the Haikei skills
plugin installed. See the repo README for per-harness setup.

## Setup

Follow [references/setup.md](references/setup.md) for the full walkthrough.
Kei governs every connector call. The agent never holds, asks for, or prints a
raw credential. Linear is OAuth only: there is no API-key or
`--credential-ref` path (the CLI rejects it for Linear).

- **Create the connector (owner/admin):** discover existing connectors first
  with `kei connectors list --workspace W`, then:

  ```bash
  kei connectors create --provider linear --account-model per_user \
    --name linear --workspace W \
    --capabilities team.read,issue.read,issue.create,comment.create
  ```

  It prints the `Connector instance ID`. Without `--capabilities` the
  connector gets the read capabilities only. For the agent to file issues or
  comments, always include `issue.create` (and `comment.create`) in
  `--capabilities` when you give the create command. `comment.create` needs a
  kei release built on the Linear write contract (kei-connector-contracts
  v0.8.0 or later); older releases reject it.
- **Per-user (`per_user`, the default):** each user connects their own Linear
  account from their chat harness, like the Linear MCP. The bridge runs the
  authorization-code flow with PKCE (S256); the user approves in the browser,
  and Kei stores the token (24-hour access token, refreshed automatically).
  Issues are created as that user. `kei connectors reconnect` does not apply
  to per-user connectors.
- **Shared (`shared`):** one Linear account for the workspace. An admin runs
  `kei connectors reconnect <id> --workspace W`, approves the printed consent
  URL, and re-runs it when Kei reports `connector_reconnect_required`.
  `kei connectors get <id> --workspace W` shows `connected (active)` when done.
- **Scopes:** Kei requests `read,write,issues:create,comments:create`.
  `issue.create` needs `issues:create` and `comment.create` needs
  `comments:create`. A user who connected before writes were enabled
  reconnects to grant them.
- **Connector ID:** not a secret. For Pedro on Discord it goes in the Helm
  value `keiProxy.runtime.linearConnectorID`, which sets
  `KEI_CONNECTOR_LINEAR_ID`.
- **Verify** with a read: `kei-proxy connector invoke --connector <id>
  --capability team.read --action read --resource linear/team/<KEY>`.
- **At runtime:** the governed connector injects the credential through
  `kei-proxy connector invoke`. The agent sees results and reason codes, never
  the token.
- **Rollout:** Linear sign-in works once the hosted Linear OAuth app is
  configured on the bridge; until then connecting fails with
  `connector provider not configured`.

When answering a setup question, write the commands in the answer itself;
don't only point at `references/setup.md`:

- **How a team or user connects (per-user, like the Linear MCP):** give the
  `kei connectors create ... --account-model per_user --capabilities ...`
  command, then say in those words that each user signs in with **Linear
  OAuth** and approves access **in the browser** (authorization code with
  PKCE). Name both "OAuth" and "browser"; there is no API key to copy.
- **Someone offers an API key:** refuse it, and give
  `kei connectors create --provider linear --workspace W` (OAuth) and
  `kei connectors reconnect <id> --workspace W` to repair a broken
  connection.
- **A bot (Pedro on Discord, `file_bug`):** recommend
  `--account-model shared`, because Discord callers have no Linear account of
  their own, with `--capabilities team.read,issue.read,issue.create` so the
  bot can file issues. Say the ID goes in `keiProxy.runtime.linearConnectorID`.
  `file_bug` runs `issue.create` on `linear/team/<KEY>` with `team_id` and an
  idempotency key (see [Governed capabilities](#governed-capabilities-kei-proxy-connector-invoke)).
- **How to create an issue:** show the `issueCreate` GraphQL mutation and its
  response (`success` plus `issue { id identifier }`), then the governed
  `kei-proxy connector invoke --capability issue.create` call that runs it.
  `kei-proxy connector invoke` has no `--data` flag; the input is `--input`.

## Lexicon — endpoints and queries

### GraphQL API

Linear exposes a GraphQL API at `https://api.linear.app/graphql`. All
queries use `POST` with an `Authorization: Bearer <token>` header. The
governed connector supplies the token via `kei-proxy connector invoke`.

| Query / Mutation | GraphQL operation | What it does | Agent notes |
| --- | --- | --- | --- |
| List issues | `issues(first: N, filter: {...})` | Fetch issues with optional filters | Use `filter` for team, assignee, status, priority, labels. Paginate with `after` cursor. |
| Get issue | `issue(id: "ID")` | Fetch a single issue by ID | Returns full issue object including description, comments, labels. |
| Create issue | `issueCreate(input: {...})` | Create a new issue | Input: `teamId`, `title`, `description`, `priority`, `assigneeId`, `labelIds`. Returns `success` (Boolean) plus the created issue's `id` and `identifier` (e.g., `ENG-42`). |
| Update issue | `issueUpdate(id: "ID", input: {...})` | Modify an existing issue | Can change title, description, status, priority, assignee, labels. |
| List teams | `teams(first: N)` | Fetch all teams the user has access to | Returns id, name, key, description. |
| List projects | `projects(first: N)` | Fetch projects | Filterable by team. |
| List cycles | `cycles(first: N)` | Fetch cycles (sprints) | Filterable by team. Returns start/end dates, name, status. |
| Search issues | `searchIssues(query: "...", first: N)` | Full-text search across issues | Includes title, description, and comment text. |
| Get user info | `viewer { id name email }` | Fetch the authenticated user | Useful for identity confirmation. |

### Governed capabilities (kei-proxy connector invoke)

These are what the governed connector actually executes. Resource formats are
fixed; anything else is denied before Linear is called.

| Capability | Action | Resource | Input | Result |
| --- | --- | --- | --- | --- |
| `team.read` | `read` | `linear/team/<KEY>` | `{}` | `{key, name}` |
| `project.read` | `read` | `linear/project/<id>` | `{}` | `{id, team_key, name, state}` |
| `cycle.read` | `read` | `linear/cycle/<id>` | `{}` | `{id, team_key, name, starts_at, ends_at}` |
| `issue.read` | `read` | `linear/issue/<ID>` | `{}` | `{id, identifier, team_key, project_id?, title, state}` |
| `issue.create` | `create` | `linear/team/<KEY>` | `{team_id, title, description?, priority?}` | `{id, identifier, team_key, url}` |
| `comment.create` | `create` | `linear/issue/<ID>` | `{issue_id, body}` | `{id, issue_id, url}` |

File a bug in team ENG (the team is the parent: `team_id` must equal the
resource's team):

```bash
kei-proxy connector invoke --connector <connector_id> \
  --capability issue.create --action create --resource linear/team/ENG \
  --idempotency-key <stable-key> \
  --input '{"team_id":"ENG","title":"Login crashes on Safari","description":"Steps...","priority":2}'
```

Under the hood `issue.create` runs Linear's `issueCreate` mutation:

```graphql
mutation {
  issueCreate(input: { teamId: "<team uuid>", title: "Login crashes on Safari", priority: 2 }) {
    success
    issue { id identifier url }
  }
}
```

Linear's response carries `success` (Boolean) and the new issue's `id` and
`identifier`: `{"data":{"issueCreate":{"success":true,"issue":{"id":"…","identifier":"ENG-42"}}}}`.
Kei checks `success` and returns `{id, identifier, team_key, url}`. When you
explain issue creation, name all three: `issueCreate` with `teamId` and
`title`, the `success` flag, and the issue's `id`/`identifier`.
`comment.create` runs `commentCreate`.

Comment on ENG-42 (the issue is the parent):

```bash
kei-proxy connector invoke --connector <connector_id> \
  --capability comment.create --action create --resource linear/issue/ENG-42 \
  --idempotency-key <stable-key> \
  --input '{"issue_id":"ENG-42","body":"Reproduced on 1.4.2."}'
```

Write rules:

- `--idempotency-key` is required. Reuse the same key when retrying the same
  write: Kei derives the new issue's id from it, so a retry returns the
  existing issue instead of filing a duplicate. Kei never retries a write
  itself. Do not generate a new key for a retry: a new key would file a
  second issue. Say so when you answer a retry question.
- Inputs are strict: title 1–256 characters on one line, description and
  body up to 12 KiB, priority 0–4. Unknown fields (for example `labels`,
  `team_key`, `workspace_id`) are rejected with `input_invalid`.
- The workspace is never an argument: it is the connector's OAuth grant.
- Results name the new issue or comment; they never echo the title,
  description or body. Audit records only digests and the idempotency key.
- Denials come back as reason codes, for example `capability_not_supported`
  (`issue.update`, deletes), `input_invalid` (bad input, parent mismatch,
  missing idempotency key, missing write scope), `connector_not_connected`,
  or `connector_reconnect_required`. Do not retry a deny with different
  arguments to get around it, and do not claim the write happened.

### Credential pass-through

This connector does **not** manage credentials. Kei supplies the Linear
OAuth token (the user's, or the shared account's) at run time via
`kei-proxy connector invoke`.
The agent never reads or stores a token, secret, or API key.

### Denied command surface

These actions are **not available** through the governed connector — they fall
outside the connector's scope:

| Operation | Reason |
| --- | --- |
| Delete issue (issue deletion) | Not available — irreversible; requires admin token scope |
| Update issue (`issue.update`) | Defined in the contract but not executed by the runtime (`capability_not_supported`) |
| Delete team (team deletion) | Not available — org-admin scope outside the connector token |
| Manage webhooks / integrations | Admin scope outside governed token |
| Modify organization settings | Requires org-admin privileges |
| Add/remove team members | User management outside connector scope |

## Pragmatics — how agents use this connector

### Common use cases

1. **Issue triage**: List issues assigned to a user, filter by status and
   priority, update status as work progresses.
2. **Sprint planning**: Query active cycle issues, check scope changes,
   create new issues for the current cycle.
3. **Project tracking**: List projects, fetch their associated issues,
   update issue status on PR merge.
4. **Bug intake**: `issue.create` on `linear/team/<KEY>` with `team_id`,
   a one-line `title`, the repro steps in `description`, and severity mapped
   to `priority` (critical 1, high 2, medium 3, low 4). Discord `file_bug`
   (kei-agents `bug_to_linear_pr`) uses this path.
5. **Follow-up**: `comment.create` on `linear/issue/<ID>` with `issue_id`
   and `body`, for example a fix status or repro update.

### Agent patterns

- Use GraphQL fragments for consistent response shapes across queries.
- Paginate with `first` + `after` (cursor-based). Linear does not support
  offset pagination.
- Prefer `searchIssues` over `issues` when querying across teams.
- Always request only the fields you need to keep responses small.

### Pagination

Linear uses cursor-based pagination. Every list field accepts `first` (limit)
and `after` (cursor). The response includes `pageInfo` with `hasNextPage`,
`hasPreviousPage`, `startCursor`, and `endCursor`.

```graphql
issues(first: 50, after: "cursor") {
  nodes { ... }
  pageInfo { hasNextPage endCursor }
}
```

### Rate limits

Linear's GraphQL API rate limits are based on **point cost** per query
(rather than raw request count). Complex queries cost more points. The exact
limit depends on the plan:
- **Free**: 200 points per minute
- **Standard**: 400 points per minute
- **Premium**: custom limits

Check current usage from response headers: `X-Complexity-Query-Value`.

## Semantics — data model and entity relationships

### Entity hierarchy

```
organization
├── team                     # key (e.g., ENG)
│   ├── issue                # UUID; also has a sequential number within team (e.g., ENG-42)
│   │   ├── comment          # UUID
│   │   ├── label            # UUID
│   │   └── attachment       # UUID (links to external resources)
│   ├── project              # UUID; optionally linked to issues
│   ├── cycle                # UUID; time-boxed sprint
│   └── workflow_state       # UUID; defines the team's statuses (triage, started, done, canceled)
└── user                     # UUID; email
```

### Resource types (ADR-028, for Kei policy)

Per [ADR-028](https://github.com/HaikeiLabs/kei/blob/main/docs/adr/028-policy-field-contract.md) §4, Linear declares five
resource types for Kei policy (each declares its parent type): `team`,
`issue`, `project`, `cycle`, `user`:

| Resource type | Parent type | Canonical id example |
| --- | --- | --- |
| `team` | — | `ENG` |
| `issue` | `team` | `ENG-42` |
| `project` | `team` | `a1b2c3d4-e5f6-...` |
| `cycle` | `team` | `a1b2c3d4-e5f6-...` |
| `user` | — | `a1b2c3d4-e5f6-...` |

### Key fields

| Entity | Field | Type | Meaning |
| --- | --- | --- | --- |
| `issue` | `id` | UUID | Globally unique identifier |
| `issue` | `identifier` | string | Team-prefixed number: `ENG-42` |
| `issue` | `title` | string | Issue title |
| `issue` | `description` | string | Markdown description body |
| `issue` | `priority` | integer | 0 (no priority) / 1 (urgent) / 2 (high) / 3 (medium) / 4 (low) |
| `issue` | `state` | object | Workflow state (name + type: `triage`/`started`/`done`/`canceled`) |
| `team` | `key` | string | Short team identifier (e.g., `ENG`) |
| `team` | `name` | string | Team display name |

### Write arguments carry the parent (Haikei semantics rule)

A child-resource write includes its parent identifier as an argument, and the
resource names the same parent:

| Write | Parent argument | Resource | Never an argument |
| --- | --- | --- | --- |
| `issue.create` | `team_id` (team key such as `ENG`, or the team UUID) | `linear/team/<team_id>` | `workspace_id`, `tenant_id`, `organization` |
| `comment.create` | `issue_id` (identifier such as `ENG-42`, or the issue UUID) | `linear/issue/<issue_id>` | `workspace_id`, `tenant_id`, `team_id` |

Enum values come from the key-fields table (priority 0–4).

### Relationships

- Issues belong to exactly one team. The `identifier` embeds the team key.
- Issues may be linked to a project and/or a cycle, but neither is required.
- Issues may be parented (sub-issues) via `parent` / `children` relations.
- A team's workflow states define the valid status transitions for its issues.
- Labels are shared within a team but not across teams.

## Policy entries (examples)

```yaml
# Engineers can read issues in their team
- effect: permit
  principal: group:engineers
  action: linear_read
  resource: team:ENG
  connector: linear

# Everyone can file bugs in the HAI team (issue.create on its team)
- effect: permit
  principal: group:default
  action: linear_write
  capability: issue.create
  resource: team:HAI
  connector: linear

# PMs can comment on any issue
- effect: permit
  principal: group:product-managers
  action: linear_write
  capability: comment.create
  connector: linear
```

## Validation commands

```bash
# Verify this skill loads correctly
node scripts/verify-skills.mjs

# Run the connector's eval suite
node scripts/run-evals.mjs --skill linear-connector --harness opencode \
  --model-profile deepseek-v4-flash --jobs 1 \
  --out evals-out/linear-connector-deepseek-$(date +%F)
```

## Realistic usage boundaries

- **Do not** manage credentials — Kei handles authentication via the user's
  Linear OAuth grant. There is no API-key path.
- When asked how users connect their own Linear accounts, give the full
  owner command first (`kei connectors create --provider linear
  --account-model per_user --workspace W --capabilities
  team.read,issue.read,issue.create,comment.create`), then the per-user
  browser approval.
- **Do not** accept a Linear API key pasted into the conversation. Refuse, and
  point to setup (`kei connectors create --provider linear --account-model
  per_user`, then the user approves Linear in the browser) or repair
  (`kei connectors reconnect <id>` for a shared connector).
- When asked how to create an issue, give the GraphQL mutation
  (`issueCreate` with `teamId` and `title`; the response has `success` and
  `issue { id identifier }`) and the governed `kei-proxy` call that runs it.
- **Do not** put the workspace, tenant, or organization in tool arguments; the
  parent (`team_id`, `issue_id`) is the only scoping argument.
- **Do not** call a write without `--idempotency-key`, and reuse the key on a
  retry.
- **Do not** use offset pagination (`skip`, `offset`) — Linear only supports
  cursor-based pagination.
- **Do not** use the REST API — Linear has deprecated most of its REST
  endpoints. Use GraphQL.
- **Do not** assume the agent can delete resources — the governed connector
  does not expose delete mutations.
- **Do not** hardcode team IDs; resolve team keys to UUIDs via the `teams`
  query when needed.
