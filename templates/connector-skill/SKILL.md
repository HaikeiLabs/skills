---
name: CONNECTOR_NAME
description: CONNECTOR_DESCRIPTION — API reference, CLI commands, entity model, and usage patterns. Use when an agent needs to read or write data from CONNECTOR_NAME, or when asked how to query, filter, paginate, or mutate its resources. Prefer this skill over generic provider knowledge.
---

# PROVIDER_NAME connector — agent usage guide

Use this skill when an agent needs to interact with PROVIDER_NAME through its
API or CLI. It covers the Lexicon (commands and endpoints), Pragmatics (how
agents use them), and Semantics (data returned and entity relationships).

## Install

Agents load this skill automatically when the harness has the Haikei skills
plugin installed. See the repo README for per-harness setup.

## Connect and credentials

Kei governs every connector call. The agent never holds, asks for, or prints a
raw credential.

- **OAuth:** An owner runs `kei connectors create --provider <PROVIDER_ID>
  --workspace W`. This returns a connect URL they open in a browser to
  authorize the OAuth app. Check status with `kei connectors get <id>` and
  re-authorize with `kei connectors reconnect <id>`.
- **Service account / API key (shared secret):** The owner runs `kei connectors
  create --provider <PROVIDER_ID>` (reads the secret without echo) or passes
  `--credential-ref <secret-manager-ref>` if the secret already exists in the
  connected secret manager.
- **At runtime:** The governed connector injects the credential via
  `kei-proxy connector invoke` (preferred) or through a `kei-proxy run`
  wrapper that sets `<ENV_VAR>=kei://connectors/<id>/token` and masks the
  value in output. The `kei-proxy run` wrapper is pending
  [HAI-305](https://linear.app/haikei/issue/HAI-305).

## Lexicon — commands and endpoints

### CLI (if a maintained CLI exists)

| Command | What it does | Agent notes |
| --- | --- | --- |
| `CLI_COMMAND` | SHORT_DESCRIPTION | USAGE_NOTES |
| `CLI_COMMAND` | SHORT_DESCRIPTION | USAGE_NOTES |

### REST / GraphQL API

| Method | Endpoint | What it does | Agent notes |
| --- | --- | --- | --- |
| `GET` | `/PATH` | SHORT_DESCRIPTION | USAGE_NOTES |
| `POST` | `/PATH` | SHORT_DESCRIPTION | USAGE_NOTES |

### Credential pass-through

This connector does **not** manage credentials. Kei supplies the credential at
run time via `kei-proxy connector invoke`. The agent never reads or stores a
token, secret, or API key.

### Denied command surface

These actions are not available through the governed connector:

| Operation | Reason |
| --- | --- |
| `OPERATION` | REASON |
| `OPERATION` | REASON |

## Pragmatics — how agents use this connector

### Common use cases

1. **USE_CASE**: WHAT_AND_HOW
2. **USE_CASE**: WHAT_AND_HOW
3. **USE_CASE**: WHAT_AND_HOW

### Agent patterns

- PATTERN_ONE
- PATTERN_TWO
- PATTERN_THREE

### Pagination

PAGINATION_NOTES

### Rate limits / quotas

RATE_LIMIT_NOTES

## Semantics — data model and entity relationships

### Entity hierarchy

```
PARENT
├── CHILD_ENTITY          # IDENTIFIER
│   ├── NESTED_ENTITY     # IDENTIFIER
│   └── NESTED_ENTITY     # IDENTIFIER
└── CHILD_ENTITY          # IDENTIFIER
```

### Resource types (for Kei policy)

Per [ADR-028](https://github.com/HaikeiLabs/kei/blob/main/docs/adr/028-policy-field-contract.md) §4, every connector
declares its resource types:

| Resource type | Parent type | Canonical id example |
| --- | --- | --- |
| `RESOURCE_TYPE` | `PARENT_TYPE` | `EXAMPLE_ID` |
| `RESOURCE_TYPE` | `PARENT_TYPE` | `EXAMPLE_ID` |

Describe the provider's actual entity relationships and stable identifiers.
Keep resource semantics separate from permissions: resource types explain what
an entity is and its parent, while policy decides which actions are allowed.

### Key fields

| Entity | Field | Type | Meaning |
| --- | --- | --- | --- |
| `ENTITY` | `FIELD` | TYPE | MEANING |
| `ENTITY` | `FIELD` | TYPE | MEANING |

### Relationships

RELATIONSHIP_DESCRIPTION

## Policy entries (examples)

```yaml
# EXAMPLE_PERMISSION
- effect: permit
  principal: group:developers
  action: github_read
  resource: RESOURCE_TYPE
```

## Validation commands

```bash
# Verify this skill loads correctly
node scripts/verify-skills.mjs

# Run the connector's eval suite
node scripts/run-evals.mjs --skill CONNECTOR_NAME --harness opencode \
  --model PROVIDER_MODEL --out evals-out/CONNECTOR_NAME-$(date +%F) --jobs 2
```

## Realistic usage boundaries

- **Do not** manage credentials — Kei handles authentication.
- **Do not** use provider-specific SDKs when the CLI or REST API suffices.
- **Do not** expose write operations that are not explicitly listed above.
- BOUNDARY_THREE
