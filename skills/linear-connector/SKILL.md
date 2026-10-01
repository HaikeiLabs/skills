---
name: linear-connector
description: Linear data connector — API reference, entity model, and usage patterns. Use when an agent needs to read or write Linear data (issues, teams, projects, cycles), or when asked how to query, filter, paginate, or mutate Linear resources. Prefer this skill over generic Linear knowledge.
---

# Linear connector — agent usage guide

Use this skill when an agent needs to interact with Linear through its
GraphQL API. It covers the Lexicon (endpoints and queries), Pragmatics (how
agents use them), and Semantics (data returned and entity relationships).

There is no maintained official CLI for Linear. Agents use the GraphQL API
directly.

## Install

Agents load this skill automatically when the harness has the Haikei skills
plugin installed. See the repo README for per-harness setup.

## Connect and credentials

Kei governs every connector call. The agent never holds, asks for, or prints a
raw credential.

- **OAuth (Linear App):** An owner runs `kei connectors create --provider linear
  --workspace W`. This returns a connect URL they open in a browser to
  authorize the Linear OAuth app. Check status with `kei connectors get <id>` and
  re-authorize with `kei connectors reconnect <id>`.
- **API key (shared secret):** The owner runs `kei connectors
  create --provider linear` (reads the key without echo) or passes
  `--credential-ref <secret-manager-ref>` if the key already exists in the
  connected secret manager.
- **At runtime:** The governed connector injects the credential via
  `kei-proxy connector invoke` (preferred) or through a `kei-proxy run`
  wrapper that sets `LINEAR_API_KEY=kei://connectors/<id>/token` and masks the
  value in output. The `kei-proxy run` wrapper is pending
  [HAI-305](https://linear.app/haikei/issue/HAI-305).

## Lexicon — endpoints and queries

### GraphQL API

Linear exposes a GraphQL API at `https://api.linear.app/graphql`. All
queries use `POST` with an `Authorization: Bearer <token>` header. The
governed connector supplies the token via `kei-proxy connector invoke`.

| Query / Mutation | GraphQL operation | What it does | Agent notes |
| --- | --- | --- | --- |
| List issues | `issues(first: N, filter: {...})` | Fetch issues with optional filters | Use `filter` for team, assignee, status, priority, labels. Paginate with `after` cursor. |
| Get issue | `issue(id: "ID")` | Fetch a single issue by ID | Returns full issue object including description, comments, labels. |
| Create issue | `issueCreate(input: {...})` | Create a new issue | Input: `teamId`, `title`, `description`, `priority`, `assigneeId`, `labelIds`. |
| Update issue | `issueUpdate(id: "ID", input: {...})` | Modify an existing issue | Can change title, description, status, priority, assignee, labels. |
| List teams | `teams(first: N)` | Fetch all teams the user has access to | Returns id, name, key, description. |
| List projects | `projects(first: N)` | Fetch projects | Filterable by team. |
| List cycles | `cycles(first: N)` | Fetch cycles (sprints) | Filterable by team. Returns start/end dates, name, status. |
| Search issues | `searchIssues(query: "...", first: N)` | Full-text search across issues | Includes title, description, and comment text. |
| Get user info | `viewer { id name email }` | Fetch the authenticated user | Useful for identity confirmation. |

### Credential pass-through

This connector does **not** manage credentials. Kei supplies a Linear API
key (personal or team token) at run time via `kei-proxy connector invoke`.
The agent never reads or stores a token, secret, or API key.

### Denied command surface

These actions are not available through the governed connector:

| Operation | Reason |
| --- | --- |
| Delete issue | Irreversible; requires admin token scope |
| Delete team | Org-admin scope outside the connector token |
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

### Resource types (for Kei policy)

Per [ADR-028](https://github.com/HaikeiLabs/kei/blob/main/docs/adr/028-policy-field-contract.md) §4, every connector
declares its resource types:

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

- **Do not** manage credentials — Kei handles authentication via Linear API key.
- **Do not** use offset pagination (`skip`, `offset`) — Linear only supports
  cursor-based pagination.
- **Do not** use the REST API — Linear has deprecated most of its REST
  endpoints. Use GraphQL.
- **Do not** assume the agent can delete resources — the governed connector
  does not expose delete mutations.
- **Do not** hardcode team IDs; resolve team keys to UUIDs via the `teams`
  query when needed.
