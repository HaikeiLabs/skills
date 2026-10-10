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

- The agent never holds, asks for, or prints a raw credential. Kei supplies a
  Linear OAuth token at run time via `kei-proxy connector invoke`. Setup: an
  owner runs `kei connectors create --provider linear` (OAuth only, `per_user`
  or `shared`); see [Setup](#setup).
- Issue deletion is not available through the governed connector — it is
  irreversible and requires admin token scope.
- Resource types for Kei policy follow ADR-028: `team`, `issue`, `project`,
  `cycle`, `user` (issues, projects, and cycles have `team` as their parent).
- Linear uses cursor-based pagination only: `first` + `after`, with
  `pageInfo.hasNextPage` in the response.

## Install

Agents load this skill automatically when the harness has the Haikei skills
plugin installed. See the repo README for per-harness setup.

## Setup

Follow [references/setup.md](references/setup.md) to create a Linear
connector and copy its connector ID. In short:

- **OAuth only.** `kei connectors create --workspace W --provider linear
  --account-model per_user|shared --name NAME` prints the
  `Connector instance ID`. `per_user` (default) means each user signs in to
  Linear from their harness, like the Linear MCP. `shared` means an admin
  runs `kei connectors reconnect <id> --workspace W` and approves the printed
  consent URL. `kei connectors get <id> --workspace W` shows
  `connected (active)` when done.
- **API key: not available yet.** `--credential-ref` is rejected for Linear.
- **Connector ID:** not a secret. For Pedro on Discord it goes in the Helm
  value `keiProxy.runtime.linearConnectorID`, which sets
  `KEI_CONNECTOR_LINEAR_ID`.
- **Verify** with a read: `kei-proxy connector invoke --connector <id>
  --capability team.read --action read --resource linear/team/<KEY>`.
- **Not available yet:** Linear sign-in (the hosted Linear OAuth app is not
  configured) and writes (`issue.create` is denied with
  `capability_not_supported`; only reads run).

When answering a setup question, write the commands in the answer itself;
don't only point at `references/setup.md`:

- **Someone offers an API key:** refuse it, and give
  `kei connectors create --provider linear --workspace W` (OAuth) and
  `kei connectors reconnect <id> --workspace W` to repair a broken
  connection.
- **A bot (Pedro on Discord, `file_bug`):** recommend
  `--account-model shared`, because Discord callers have no Linear account of
  their own. Say the ID goes in `keiProxy.runtime.linearConnectorID`.
  Always end with the write gap, even when the question doesn't ask: "Writes
  are not available yet: `file_bug` (`issue.create`) is denied with
  `capability_not_supported`; only reads run."
- **How to create an issue:** show the `issueCreate` GraphQL mutation and its
  response (`success` plus `issue { id identifier }`), then note that the
  governed write is not available yet. `kei-proxy connector invoke` has no
  `--data` flag.

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
4. **Bug intake**: Create issues with repro steps, severity labels, and
   team assignment.

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

# PMs can create and update issues in any team
- effect: permit
  principal: group:product-managers
  action: linear_write
  capability: issue.write
```

## Validation commands

```bash
# Verify this skill loads correctly
node scripts/verify-skills.mjs

# Run the connector's eval suite
node scripts/run-evals.mjs --skill linear-connector --harness opencode \
  --model ray/deepseek-ai/DeepSeek-V4-Flash \
  --out evals-out/linear-connector-deepseek-$(date +%F) --jobs 2
```

## Realistic usage boundaries

- **Do not** manage credentials — Kei handles authentication via Linear OAuth.
- **Do not** use offset pagination (`skip`, `offset`) — Linear only supports
  cursor-based pagination.
- **Do not** use the REST API — Linear has deprecated most of its REST
  endpoints. Use GraphQL.
- **Do not** assume the agent can delete resources — the governed connector
  does not expose delete mutations.
- **Do not** hardcode team IDs; resolve team keys to UUIDs via the `teams`
  query when needed.
