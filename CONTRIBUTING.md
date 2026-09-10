# Contributing to the Haikei skills repo

Keep skills small: help agents find the right product and the right documentation
instead of maintaining another copy of it.

## Ground rules

- **Skills document existing behavior. They never invent APIs.** If a skill names
  a command, endpoint, flag, or type that does not exist in the code, the code
  wins. Update the skill.
- **Prefer retrieval over pre-training.** Point agents at the authoritative
  source — the `kei` CLI usage string, the ABAC engine route table, the
  `pedro-agentware` README and docs, the `kei-agents` package — rather than
  duplicating details that can drift.
- **No absolute local paths.** This repo is a public repo candidate. A skill must
  never reference a developer's home directory, a personal directory, or a
  machine-specific path. Reference repositories by product name and
  repo-relative paths only.
- **No screenshots.** Reference a live resource instead.
- **Every skill carries two sections**: `## Validation commands` (how a user
  verifies the guidance in their own checkout) and
  `## Realistic usage boundaries` (what the skill does not cover, what is not
  implemented, where the code wins over the docs).

## Adding or changing a skill

1. Read the source of truth for the subject matter and verify each command,
   endpoint, and flag against the code.
2. Put depth in `skills/<name>/references/`; keep `SKILL.md` roughly
   130-340 lines.
3. Set the `description` frontmatter as a trigger ("Use when...") so the skill
   auto-loads on match.
4. Run the verification suite before committing:

```bash
node scripts/verify-skills.mjs
node scripts/verify-manifests.mjs
node scripts/check-internal-links.mjs
```

These run in CI as well.

## Licensing and naming

The repository's name, owner org, visibility, and license are **pending** a
decision (STOP B). `LICENSE` is an Apache-2.0 placeholder until that decision
lands; do not add third-party code or content that is not compatible with it.
