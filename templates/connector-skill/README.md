# Connector skill template

This directory is a **forkable template** for building a new governed-connector
skill in the Haikei skills repository.

## What you get

- `SKILL.md` — skill document with Lexicon / Pragmatics / Semantics sections
- `evals/evals.json` — eval case template
- `evals/README.md` — instructions for running and extending evals

## How to fork

1. Copy `templates/connector-skill/` to `skills/<your-connector-name>/`.
2. Edit `SKILL.md`:
   - Replace `CONNECTOR_NAME`, `PROVIDER_NAME`, `CONNECTOR_DESCRIPTION` placeholders.
   - Fill in the **Lexicon** table with your provider's CLI commands or API endpoints.
   - Fill in the **Pragmatics** section with common agent use cases.
   - Fill in the **Semantics** section with entity hierarchy and resource types (per ADR-028 §4).
   - Update the denied command surface, credential pass-through note, and policy examples.
3. Edit `evals/evals.json`:
   - Update `skill_name` to match the folder name.
   - Replace placeholder prompts and expectations with real eval cases.
4. Run verification:
   ```bash
   node scripts/verify-skills.mjs
   node scripts/verify-manifests.mjs
   node scripts/verify-evals.mjs
   ```
5. Run evals and commit results:
   ```bash
   node scripts/run-evals.mjs --skill <your-connector-name> --harness opencode \
     --model ray/deepseek-ai/DeepSeek-V4-Flash \
     --out evals-out/<name>-deepseek-$(date +%F) --jobs 2
   ```

## Template placeholders

| Placeholder | What to replace with |
| --- | --- |
| `CONNECTOR_NAME` | Lowercase-hyphen name matching the folder (e.g., `github-connector`) |
| `PROVIDER_NAME` | Human-readable provider name (e.g., `GitHub`) |
| `CONNECTOR_DESCRIPTION` | One-line description for the skill frontmatter |
| `CLI_COMMAND` | Actual CLI invocation or endpoint |
| `RESOURCE_TYPE` | Kei policy resource type per ADR-028 |
| `PARENT_TYPE` | Parent resource type per ADR-028 |
| `PROVIDER_MODEL` | Default model for evals |

## Conventions

- One connector skill per data source.
- Each skill documents only the **governed** surface — operations available
  through the Kei connector, not the full provider API.
- Credential management is Kei's responsibility; the skill explains the
  pass-through model.
- Resource types follow ADR-028 §4 (type + optional parent, no instance globs).
