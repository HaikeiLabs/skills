---
name: github-connector
description: GitHub data connector — API reference, CLI commands, entity model, and usage patterns. Use when an agent needs to read or write GitHub data (repositories, issues, pull requests, files, workflows), or when asked how to query, filter, paginate, or mutate GitHub resources. Prefer this skill over generic GitHub knowledge.
---

# GitHub connector — agent usage guide

Use this skill when an agent needs to interact with GitHub through its API or
`gh` CLI. It covers the Lexicon (commands and endpoints), Pragmatics (how
agents use them), and Semantics (data returned and entity relationships).

## Key rules

- The agent never holds, asks for, or prints a raw credential. Kei authorizes
  the call and releases a `GITHUB_TOKEN` at run time. The harness calls the
  GitHub API directly with the released token. If the user is
  not connected to GitHub, the only valid setup path is `kei connectors
  create --provider github` (OAuth or PAT); repair with `kei connectors
  reconnect <id>`.
- Repository deletion is not available through the governed connector — it is
  irreversible and requires org-owner scope beyond the connector token.
- Resource types for Kei policy follow ADR-028 (each declares a parent type):
  `repository`, `pull_request`, `issue`, `file`, `workflow`.
- Prefer the `gh` CLI with explicit `-R OWNER/REPO` over the raw API.

## Install

Agents load this skill automatically when the harness has the Haikei skills
plugin installed. See the repo README for per-harness setup.

## Connect and credentials

Kei governs every connector call. The agent never holds, asks for, or prints a
raw credential — the only valid setup path is `kei connectors create
--provider github`. Kei authorizes each call and releases a `GITHUB_TOKEN` at
run time. The harness calls the GitHub API directly; the setup paths below are
how the owner provisions that token.

- **OAuth (GitHub App):** An owner runs `kei connectors create --provider github
  --workspace W`. This returns a connect URL they open in a browser to
  authorize the GitHub App. Check status with `kei connectors get <id>` and
  re-authorize with `kei connectors reconnect <id>`.
- **Personal access token (shared secret):** The owner runs `kei connectors
  create --provider github` (reads the `GITHUB_TOKEN` without echo) or passes
  `--credential-ref <secret-manager-ref>` if the token already exists in the
  connected secret manager.
- **At runtime:** Kei authorizes each call and releases the `GITHUB_TOKEN`. The
  harness calls the GitHub API directly, injecting the token as the
  `GITHUB_TOKEN` environment variable.

## Lexicon — commands and endpoints

### CLI (`gh`)

The official [GitHub CLI (`gh`)](https://cli.github.com) is the preferred
surface for agent interactions. It authenticates via `GITHUB_TOKEN` (supplied
by Kei) or `gh auth`.

| Command | What it does | Agent notes |
| --- | --- | --- |
| `gh repo view OWNER/REPO` | View repository details | Outputs description, URL, default branch, stars, language. Use `--json` for machine parseable output. |
| `gh repo list OWNER` | List repositories for an owner | Flags: `--limit`, `--language`, `--topic`, `--visibility`. Paginate with `--page`. |
| `gh issue list -R OWNER/REPO` | List issues in a repository | Flags: `--state`, `--label`, `--assignee`, `--author`, `--search`, `--limit`, `--page`. |
| `gh issue view ISSUE_NUMBER -R OWNER/REPO` | View a single issue | Use `--comments` to include comment bodies. |
| `gh pr list -R OWNER/REPO` | List pull requests | Flags: `--state`, `--base`, `--head`, `--label`, `--search`, `--limit`, `--page`. |
| `gh pr view PR_NUMBER -R OWNER/REPO` | View a single pull request | Use `--comments` and `--json` for structured output. |
| `gh pr diff PR_NUMBER -R OWNER/REPO` | Show PR diff | Outputs a unified diff. Useful for code review summaries. |
| `gh search issues -- QUERY` | Search issues across GitHub | Flags: `--owner`, `--repo`, `--state`, `--label`, `--author`, `--limit`. |
| `gh api ENDPOINT` | Call any GitHub REST API endpoint | Fallback when the dedicated command is insufficient. Pass `--method`, `--field`, `--input` as needed. |

### REST API

The `gh api` command wraps the REST API, but agents may call it directly:

| Method | Endpoint | What it does | Agent notes |
| --- | --- | --- | --- |
| `GET` | `/repos/{owner}/{repo}` | Repository metadata | Includes description, visibility, default branch, topics, license. |
| `GET` | `/repos/{owner}/{repo}/issues` | List issues | Query params: `state`, `labels`, `assignee`, `sort`, `direction`, `per_page`, `page`. |
| `GET` | `/repos/{owner}/{repo}/pulls` | List pull requests | Query params: `state`, `head`, `base`, `sort`, `direction`, `per_page`, `page`. |
| `GET` | `/repos/{owner}/{repo}/pulls/{number}` | PR details | Includes mergeable state, review status, commits count. |
| `GET` | `/repos/{owner}/{repo}/pulls/{number}/files` | PR file diff metadata | Lists changed files, additions, deletions, status. |
| `GET` | `/repos/{owner}/{repo}/contents/{path}` | Repository file contents | Returns file contents (base64-encoded) or directory listing. |
| `POST` | `/repos/{owner}/{repo}/issues` | Create an issue | Body: `{"title": "...", "body": "...", "labels": [...]}`. |
| `POST` | `/repos/{owner}/{repo}/pulls` | Create a pull request | Body: `{"title": "...", "head": "...", "base": "...", "body": "..."}`. |
| `PATCH` | `/repos/{owner}/{repo}/issues/{number}` | Update an issue | Modify title, body, state, labels, assignees. |

### Credential pass-through

This connector does **not** manage credentials. Kei authorizes each call and
releases a `GITHUB_TOKEN` (fine-grained personal access token with appropriate
repository and organization permissions) at run time. The harness calls the
GitHub API directly. The agent never reads or stores a token, secret, or
API key.

### Denied command surface

These actions are **not available** through the governed connector — they fall
outside the connector's scope:

| Operation | Reason |
| --- | --- |
| Repository deletion | Not available — irreversible; requires org-owner scope beyond the connector token |
| Branch deletion | Managed through repository protection rules, not the connector |
| Admin operations (add collaborator, modify org settings, manage webhooks) | Require admin scope outside the governed token |
| Workflow dispatch on untrusted repos | Guarded by environment-specific policy |

## Pragmatics — how agents use this connector

When asked for a token or how to authenticate, always state: the only valid
setup path is `kei connectors create --provider github`; the agent never
accepts or handles a raw token.

If the user is not connected yet, or asks you for their `GITHUB_TOKEN`, answer
with all three points:

1. You do not ask for or accept a raw token.
2. An owner connects GitHub with `kei connectors create --provider github
   --workspace W` and opens the returned connect URL.
3. An existing connector is checked with `kei connectors get <id>` and
   repaired with `kei connectors reconnect <id>`.

### Common use cases

1. **Code review support**: Fetch PR diff (`gh pr diff`), list changed files,
   summarize changes, post review comments.
2. **Issue triage**: List open issues by label, filter by assignee, update
   status or priority.
3. **Repository discovery**: List repos by topic or language, view repo
   metadata for onboarding or auditing.
4. **File inspection**: Read file contents at a specific path or ref without
   cloning the repository.
5. **Search**: Use `gh search issues` to find relevant discussions across
   repositories.

### Agent patterns

- Prefer the `gh` CLI over the raw API — it handles auth, pagination, and
  formatting automatically.
- Use `--json` flags for machine-parseable output. Pipe through `jq` for
  further processing.
- Always specify `-R OWNER/REPO` explicitly. Do not rely on the working
  directory's upstream.

### Pagination

The `gh` CLI supports `--limit N` and `--page N` flags. The default page size
varies by resource (typically 30). Use `--limit 0` to fetch all results (be
mindful of rate limits). The REST API uses `per_page` (max 100) and `page`
query parameters.

### Rate limits

GitHub REST API rate limits depend on the token class:
- **Fine-grained PAT**: 5,000 requests per hour per token.
- **OAuth / GHA token**: 5,000 requests per hour per authenticated user.
- **Unauthenticated**: 60 requests per hour (not applicable — the governed
  connector always provides a token).

Check current limit: `gh api /rate_limit`.

## Semantics — data model and entity relationships

### Entity hierarchy

```
organization
├── repository              # owner/name
│   ├── issue               # number (unique within repo)
│   │   └── comment         # id
│   ├── pull_request        # number (unique within repo)
│   │   ├── review          # id
│   │   ├── review_comment  # id
│   │   └── commit          # sha
│   ├── file                # path (within default branch)
│   └── workflow            # id
└── team                    # slug
```

### Resource types (ADR-028, for Kei policy)

Per [ADR-028](https://github.com/HaikeiLabs/kei/blob/main/docs/adr/028-policy-field-contract.md) §4, GitHub declares five
resource types for Kei policy (each declares its parent type): `repository`,
`pull_request`, `issue`, `file`, `workflow`:

| Resource type | Parent type | Canonical id example |
| --- | --- | --- |
| `repository` | — | `HaikeiLabs/skills` |
| `pull_request` | `repository` | `174` |
| `issue` | `repository` | `42` |
| `file` | `repository` | `src/main.go` |
| `workflow` | `repository` | `ci.yml` |

### Key fields

| Entity | Field | Type | Meaning |
| --- | --- | --- | --- |
| `repository` | `full_name` | string | `owner/name`, globally unique |
| `repository` | `default_branch` | string | Branch name (e.g., `main`) |
| `issue` | `number` | integer | Sequential ID within the repo |
| `issue` | `state` | string | `open` or `closed` |
| `pull_request` | `number` | integer | Sequential ID within the repo |
| `pull_request` | `mergeable` | string or null | `mergeable`, `not_mergeable`, or `null` (pending) |
| `pull_request` | `draft` | boolean | True for draft PRs |

### Relationships

- Issues and PRs share the same number namespace within a repository.
- An issue belongs to exactly one repository. Transferring changes the repo.
- A PR's base and head are `owner:branch` references; the head may be in a
  fork.
- File paths are relative to the repository root and tied to a specific ref
  (branch, tag, or commit SHA).

## Policy entries (examples)

```yaml
# Engineers can read issues and PRs in their team's repos
- effect: permit
  principal: group:developers
  action: github_read
  resource: repository:HaikeiLabs/*
  connector: github

# Only senior engineers can create PRs
- effect: permit
  principal: group:senior-engineers
  action: github_write
  capability: pull_request.write
```

## Validation commands

```bash
# Verify this skill loads correctly
node scripts/verify-skills.mjs

# Run the connector's eval suite
node scripts/run-evals.mjs --skill github-connector --harness opencode \
  --model ray/deepseek-ai/DeepSeek-V4-Flash \
  --out evals-out/github-connector-deepseek-$(date +%F) --jobs 2
```

## Realistic usage boundaries

- **Do not** manage credentials — Kei handles authentication via GITHUB_TOKEN.
- **Do not** use the `gh` CLI for operations that require interactive prompts;
  pass all flags explicitly.
- **Do not** write to branches outside `--base` targets allowed by policy.
- **Do not** assume write access — the governed token may be read-only per
  policy.
- **Do not** use GitHub's GraphQL API v4 unless the REST API or a `gh`
  command does not cover the need. Prefer REST for simplicity.
