# Connector skill tutorial — from fork to published skill

This tutorial walks through creating a new governed-connector skill in the
Haikei skills repository. You will fork the template, fill in every section,
write eval cases, run verification, and open a pull request.

By the end you will have a `SKILL.md` in `skills/<your-connector-name>/` that
loads as a portable Agent Skill in every supported harness (Claude Code, Codex,
opencode, Cursor, Pi).

**Audience:** Developer with an API key or OAuth client for the target provider,
familiar with `kei connectors` and `kei-proxy` basics. If you have not set up a
connector yet, start with the `kei-connector-setup` skill.

**Source of truth:** The template at `templates/connector-skill/`, the existing
connector skills under `skills/`, and the four ADRs that define the Kei
connector contract:
- [ADR-019](https://github.com/HaikeiLabs/kei/blob/main/docs/adr/019-resource-oriented-apis-and-a-uniform-cli.md)
  — AIP endpoints, uniform CLI
- [ADR-026](https://github.com/HaikeiLabs/kei/blob/main/docs/adr/026-policy-bundle-lifecycle.md)
  — unsigned bundles over TLS, no signing
- [ADR-028](https://github.com/HaikeiLabs/kei/blob/main/docs/adr/028-policy-field-contract.md)
  — `kei.match/v1` dialect, resource types, `effect: permit|deny`
- [ADR-029](https://github.com/HaikeiLabs/kei/blob/main/docs/adr/029-harness-command-policy.md)
  — `kei.harness-match/v1` dialect, rendered native permissions, report-only hook

---

## 1. Fork the template

```bash
mkdir -p skills/<your-connector-name>
cp -r templates/connector-skill/* skills/<your-connector-name>/
```

This copies `SKILL.md`, `evals/evals.json`, and `evals/README.md` into a new
folder under `skills/`. The folder name becomes the skill's `name` frontmatter,
the CLI `--skill` argument, and the plugin `name` — choose a short
lowercase-hyphen name like `github-connector`, `discord-connector`,
`grafana-connector`.

**Do not edit `templates/connector-skill/` directly.** Keep the template clean
so others can re-fork it.

---

## 2. Fill in SKILL.md

The template has three kinds of placeholders:

| Pattern | Where | What to replace with |
| --- | --- | --- |
| `CONNECTOR_NAME` | Frontmatter, evals, validation commands | Folder name, e.g. `pagerduty-connector` |
| `PROVIDER_NAME` | Headings, prose | Human-readable, e.g. `PagerDuty` |
| `CONNECTOR_DESCRIPTION` | Frontmatter | One-line trigger description |
| `CLI_COMMAND`, `RESOURCE_TYPE`, `PARENT_TYPE`, `PROVIDER_MODEL` | Tables, examples | Values from the provider's API surface |
| `PLACEHOLDER` / `TODO` / `REPLACE_ME` | Across the file | Real content — the verify script rejects these |

### 2.1 Frontmatter

```yaml
---
name: pagerduty-connector
description: PagerDuty data connector — API reference, entity model, and usage patterns. Use when an agent needs to read or write PagerDuty data (incidents, services, escalation policies, on-calls), or when asked how to query, filter, paginate, or mutate PagerDuty resources. Prefer this skill over generic PagerDuty knowledge.
---
```

Rules:
- `name` must equal the folder name, lowercase-hyphen, max 64 chars.
- `description` acts as the auto-load trigger. Start with "Use when...".

### 2.2 Connect and credentials

Every connector skill documents how the credential reaches the agent at run
time. There are exactly two patterns; choose the one that matches your
provider:

**OAuth (GitHub, Google, Slack, Atlassian):**
```markdown
- **OAuth:** An owner runs `kei connectors create --provider <PROVIDER_ID>
  --workspace W`. This returns a connect URL they open in a browser to
  authorize. Check status with `kei connectors get <id>` and re-authorize with
  `kei connectors reconnect <id>`.
```

**Service account / API key / PAT (Discord, Grafana, PagerDuty, Linear):**
```markdown
- **Service account / API key:** The owner runs `kei connectors create
  --provider <PROVIDER_ID>` (reads the secret without echo) or passes
  `--credential-ref <secret-manager-ref>` if the key already exists in the
  connected secret manager.
```

**Runtime credential injection:**
```markdown
- **At runtime:** The governed connector injects the credential via
  `kei-proxy connector invoke` (preferred) or through a `kei-proxy run`
  wrapper that sets `<ENV_VAR>=kei://connectors/<id>/token` and masks the
  value in output. The `kei-proxy run` wrapper is pending
  [HAI-305](https://linear.app/haikei/issue/HAI-305).
```

**Cardinal rule:** The agent never holds, asks for, or prints a raw credential.
The `evals.json` includes a test that checks this. If a user pastes a token, the
agent must refuse and explain the `kei connectors create` flow instead.

> **Placeholder endpoint note:** Until the real connector ships, the
> `kei connectors create --provider <PROVIDER_ID>` command is not yet
> implemented. The skill documents what it *will* look like. Add a note:
> ```markdown
> > **Note:** The real <PROVIDER_NAME> connector is being built (HAI-XXX).
> > `kei connectors create --provider <PROVIDER_ID>` works once it ships.
> ```
> See the [Discord connector](../../skills/discord-connector/SKILL.md) and
> [Grafana connector](../../skills/grafana-connector/SKILL.md) for examples.

### 2.3 Lexicon — commands and endpoints

The Lexicon table is the agent's quick reference. Two layouts:

**CLI exists (e.g. `gh`, `linear`, `pagerduty`):**
Use a four-column table:
```markdown
| Command | What it does | Agent notes |
| --- | --- | --- |
| `gh issue list -R OWNER/REPO` | List issues | Flags: `--state`, `--label`, `--assignee`, `--limit` |
| `gh pr view PR -R OWNER/REPO` | View a pull request | Use `--comments`, `--json` for structured output |
```

Reference: [GitHub connector](../../skills/github-connector/SKILL.md) — 10 CLI
commands, 12 REST endpoints, rate limits, pagination.

**No maintained CLI (e.g. Discord, Grafana):**
Use the REST API directly:
```markdown
| Method | Endpoint | What it does | Agent notes |
| --- | --- | --- | --- |
| `GET` | `/api/incidents` | List incidents | Query params: `status`, `urgency`, `service_ids`, `limit` |
| `GET` | `/api/incidents/{id}` | Get incident details | Includes services, assignees, escalation policy |
```

Reference: [Discord connector](../../skills/discord-connector/SKILL.md) — 15
endpoints, cursor pagination; [Grafana connector](../../skills/grafana-connector/SKILL.md)
— 18 endpoints, offset pagination.

Include these sub-sections in every Lexicon:

**Credential pass-through:**
```markdown
This connector does **not** manage credentials. Kei supplies the credential at
run time via `kei-proxy connector invoke`. The agent never reads or stores a
token, secret, or API key.
```

**Denied command surface:**
A table of operations the governed connector does not expose:
```markdown
| Operation | Reason |
| --- | --- |
| Delete incidents | Irreversible; requires admin scope beyond the connector token |
| Acknowledge incidents on behalf of others | Escalation policy scope outside governed connector |
| Modify service settings | Admin operation outside governed token |
```

### 2.4 Pragmatics — how agents use this connector

**Common use cases** (3–5 items). Each is a short paragraph naming the task and
the preferred command or endpoint:
```markdown
1. **Incident triage**: List open incidents by urgency and status. Use
   `GET /api/incidents?statuses[]=triggered&urgencies[]=high` to find
   unacknowledged high-urgency incidents.
2. **Service discovery**: List services with `GET /api/services` to find the
   correct service ID by name, then read its escalation policy and
   integration details.
3. **On-call lookup**: Use `GET /api/oncalls` with `include[]=users` to see
   who is on call for each escalation policy.
```

**Agent patterns:**
- Bullet-list of conventions agents should follow (pagination, auth headers,
  output format).
- "Always specify the full API version", "Prefer UID-based lookups over
  name-based", "Use `--json` flags for machine-parseable output."

**Pagination:**
Describe the provider's pagination style (cursor, offset, page token):
```markdown
PagerDuty uses offset pagination. List endpoints accept `limit` (max 100) and
`offset` (0-based). Response includes `more: true` when further pages exist.
```

**Rate limits:**
Document the provider's rate limits and how to handle 429s:
```markdown
PagerDuty rate limits: 500 requests per minute per API key. On `429 Too Many
Requests`, wait the `Retry-After` header value before retrying.
```

### 2.5 Semantics — data model and entity relationships

**Entity hierarchy:**
```
organization
├── service              # id (string); name, status, escalation_policy
│   └── integration      # id (string); type, vendor
├── escalation_policy    # id (string); name, on_call_handoff_notifications
│   └── on_call           # user.id+escalation_policy.id; start, end, level
├── incident             # id (string); title, urgency, status, service.id
│   └── note             # id (string); content, created_at
└── user                 # id (string); name, email, time_zone
```

**Resource types (for Kei policy):**
Per [ADR-028](https://github.com/HaikeiLabs/kei/blob/main/docs/adr/028-policy-field-contract.md) §4:

| Resource type | Parent type | Canonical id example |
| --- | --- | --- |
| `service` | — | `PABCDEF` |
| `incident` | `service` | `QXYZ123` |
| `escalation_policy` | — | `EABCDEF` |
| `user` | — | `UABCDEF` |

**Key fields:**

| Entity | Field | Type | Meaning |
| --- | --- | --- | --- |
| `incident` | `id` | string | Unique incident identifier |
| `incident` | `title` | string | Incident summary |
| `incident` | `urgency` | string | `high` or `low` |
| `incident` | `status` | string | `triggered`, `acknowledged`, `resolved` |
| `service` | `id` | string | Unique service identifier |
| `service` | `status` | string | `active`, `warning`, `critical`, `maintenance` |

**Relationships:**
- An incident belongs to exactly one service.
- An escalation policy has one or more on-call schedules.
- A user may be on call for multiple escalation policies.
- Notes are children of incidents; they disappear when the incident is
  resolved.

### 2.6 Policy entries (examples)

Provide 2–3 YAML policy examples in the `## Policy entries (examples)`
section. These are **illustrations** — the skill is a reference the admin reads
when authoring policy in the console or through `kei policies create`:

```yaml
# On-call engineers can read incidents in their services
- effect: permit
  src: group:oncall
  dst: capability:pagerduty.read
  resource: service:*
  connector: pagerduty

# Only incident-commander role can acknowledge and resolve incident
- effect: permit
  src: group:incident-commanders
  dst: incident.write
  capability: incident.write
```

Use `kei.match/v1` (flat `src`/`dst`, `effect: permit|deny`, per ADR-028 §5).
For harness commands (CLI invocations), use `kei.harness-match/v1` with
`shell:`, `skill:`, `path:`, `tool:` destinations (per ADR-029 §1). Example:

```yaml
# Users can run read-only pd commands
- effect: permit
  src: harness:opencode
  dst: shell:pd incident list
  dst: shell:pd service list
  dst: shell:pd user list

# Only incident commanders can acknowledge
- effect: permit
  src: harness:opencode
  dst: shell:pd incident acknowledge

# No one can delete from the CLI
- effect: deny
  src: harness:*
  dst: shell:pd incident delete
```

**Do not** use `shell:*` to permit arbitrary commands — Bash is restricted by
default (ADR-029 §1.4, §9.4). Only specific argv-token prefixes may be
permitted.

---

## 3. Write evals

Edit `skills/<your-connector-name>/evals/evals.json`. Every connector skill
must carry at least two eval cases (`verify-evals.mjs` requires ≥ 2).

The template provides six cases that cover the canonical dimensions:

| # | What it tests | Prompt shape |
| --- | --- | --- |
| 1 | List resources | "What CLI command would I use to list all items in PROVIDER_NAME?" |
| 2 | Read a specific entity | "How do I read a specific ENTITY in PROVIDER_NAME given its ID?" |
| 3 | Denied operation | "Can I DELETE something through the governed PROVIDER_NAME connector?" |
| 4 | Resource types | "What resource types does PROVIDER_NAME declare for Kei policy?" |
| 5 | Credential model | "How does credential management work for the PROVIDER_NAME connector?" |
| 6 | Credential refusal | "The user says they haven't connected PROVIDER_NAME yet and offers to paste their API key..." |

Replace the placeholders (`CONNECTOR_NAME`, `PROVIDER_NAME`, `CLI_COMMAND`,
`EXPECTED_FLAGS_AND_NOTES`, `RESOURCE_TYPE`, `PARENT_TYPE`, etc.) with values
for your provider.

**Expectations must be checkable by the grader alone.** The grader (always
`claude -p`, see `run-evals.mjs` line 171) receives the prompt and the
harness's answer. It does not have network access, so expectations like
"names a command from the skill" work because the skill is installed in the
`with_skill` run. Expectations like "uses the correct API endpoint" work if
the answer names it.

After editing, validate the file:
```bash
node scripts/verify-evals.mjs
```

This checks: valid JSON, `skill_name` matches folder, ≥ 2 evals, unique
integer ids, every case has `prompt`, `expected_output`, and `expectations`.

---

## 4. Plugin packaging (optional)

If you want the skill to be installable as a standalone plugin (not just
through the monorepo), fork `templates/connector-plugin/plugin.json`:

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  "name": "pagerduty-connector",
  "version": "0.1.0",
  "description": "PagerDuty governed connector — read incidents, services, on-calls, escalation policies. Haikei Kei plugin.",
  "author": { "name": "Haikei" },
  "license": "MIT",
  "keywords": ["haikei", "kei", "connector", "pagerduty"],
  "skills": "./skills/"
}
```

In the monorepo, the root `plugin.json` already covers all skills. A standalone
`plugin.json` is only needed if you publish the connector skill independently
(e.g. for a marketplace listing). When forking, replace `CONNECTOR_NAME`,
`CONNECTOR_DESCRIPTION`, and `CONNECTOR_KEYWORD`.

---

## 5. Run verification

Before committing, run the full verification suite from the repo root:

```bash
node scripts/verify-skills.mjs          # frontmatter, name=dir, required sections, no placeholders
node scripts/verify-manifests.mjs       # every plugin manifest parses as JSON with its required shape
node scripts/check-internal-links.mjs   # every internal markdown link resolves to a file
node scripts/verify-evals.mjs           # every skill has portable Aspire-style eval cases
```

All four must exit 0. These run in CI on every PR, so a failing check will
block the merge.

The verify scripts are standalone Node.js 22 scripts with no dependencies
beyond the standard library. They do not call a model.

---

## 6. Run evals

Once verification passes, run the eval suite against a real harness to confirm
the skill actually changes agent behavior:

```bash
node scripts/run-evals.mjs \
  --skill pagerduty-connector \
  --harness opencode \
  --model ray/deepseek-ai/DeepSeek-V4-Flash \
  --grader-model claude-sonnet-4-20250514 \
  --out evals-out/pagerduty-connector-deepseek-$(date +%F) \
  --jobs 2
```

This runs each eval case twice: once with the skill installed in a scratch
project, once without (baseline). The grader (`claude -p` with
`--grader-model`) judges every expectation and writes a benchmark.

**Flags explained:**

| Flag | Purpose | Example |
| --- | --- | --- |
| `--skill` | Which skill to test | `pagerduty-connector` |
| `--harness` | Which harness CLI to use | `opencode`, `claude`, `codex` |
| `--model` | Model the harness uses | `ray/deepseek-ai/DeepSeek-V4-Flash` |
| `--grader-model` | Model the grader uses | `claude-sonnet-4-20250514` |
| `--out` | Output directory | `evals-out/...` |
| `--jobs` | Parallel eval cases | `2` |

The script exits non-zero if any skill passes fewer than half of its
expectations with the skill installed. Include the pass rates in your pull
request description.

---

## 7. Commit and open a PR

```bash
git add -A
git commit -m "feat(skills): add <PROVIDER_NAME> connector skill"
```

**Push.** If SSH key forwarding is unavailable, use HTTPS with the GitHub CLI
credential helper:

```bash
GIT_CONFIG_GLOBAL=/dev/null git -c credential.helper='!gh auth git-credential' \
  push -u https://github.com/<YOUR_FORK>/skills.git <branch>
```

**Open a pull request.** If git-stacks are enabled in your checkout:

```bash
gh stack init && gh stack add && gh stack submit
```

Otherwise:

```bash
gh pr create --base main --fill
```

The PR template links to this tutorial. Remove the `templates/` changes from
the diff — the template itself stays untouched. Only your new `skills/<name>/`
folder and any changed links in `README.md` / `CONTRIBUTING.md` should appear.

---

## 8. Checklist

Before opening the PR, confirm:

- [ ] Template forked — `skills/<name>/` exists, `templates/` is unmodified.
- [ ] Frontmatter `name` matches folder, `description` starts with "Use when".
- [ ] All template placeholders replaced — run `verify-skills.mjs`.
- [ ] Connect & credentials section follows the OAuth or API-key pattern.
- [ ] Credential note says the agent never holds/asks/prints a raw credential.
- [ ] Evals pass `verify-evals.mjs` and cover list, read, denied, resource
      types, credentials, and credential refusal.
- [ ] Policy examples use `kei.match/v1` (ADR-028) and `kei.harness-match/v1`
      (ADR-029) dialects.
- [ ] Plugin JSON (if standalone) has correct name, description, keywords.
- [ ] Verification suite passes on a clean checkout.
- [ ] Eval suite runs and passes ≥ 50% of expectations (include in PR).
- [ ] One commit, one PR, `templates/` excluded from diff.
- [ ] No absolute paths, no screenshots, no tailnet references, no wiki
      dependencies.

---

## Video outline

The owner films a walkthrough of this tutorial. Suggested segments:

1. **Context (30s):** What this tutorial is — create a new connector skill from
   the template. When would you do this? (Your team adopted a new SaaS tool,
   you need to govern agent access to it.)

2. **Fork the template (45s):** `mkdir`, `cp -r`, rename to
   `skills/<connector-name>/`. Show the resulting file tree.

3. **Frontmatter and Connect (60s):** Set `name`, `description`. Walk through
   the two credential patterns — OAuth vs service account. Emphasise "never
   paste a token."

4. **Lexicon (90s):** Fill in CLI or REST tables using a real provider as
   example. Point to the GitHub connector (CLI) and Discord connector (REST)
   as reference. Show the denied command surface.

5. **Pragmatics (60s):** Write 3–5 common use cases. Show agent patterns,
   pagination style, rate limits.

6. **Semantics (60s):** Draw the entity hierarchy. Fill the resource types
   table for Kei policy (per ADR-028). Explain parent types.

7. **Policy examples (45s):** Show the YAML examples. Explain
   `kei.match/v1` vs `kei.harness-match/v1`.

8. **Evals (60s):** Walk through the six template cases. Explain what each
   tests. Replace placeholders. Run `verify-evals.mjs`.

9. **Verification + run (60s):** Run the four verify scripts. Then
   `run-evals.mjs` with `--harness opencode --model` flags. Explain
   `--grader-model`.

10. **PR (45s):** Commit, push (show the HTTPS command), `gh pr create`.
    Remove template changes from the diff.

11. **Q&A / pitfalls (60s):** "My verify script fails" — check placeholders.
    "The connector command doesn't exist yet" — use a placeholder note. "SSH
    key doesn't forward" — use the GIT_CONFIG_GLOBAL workaround.

Total target: ~12 minutes.
