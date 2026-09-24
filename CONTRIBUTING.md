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
- **No screenshots.** Reference a live resource instead. Screenshots live in the
  docs layer, not in `skills/` (D-015).
- **This repo is the only copy.** `HaikeiLabs/skills` is the single source of
  truth (D-001), and the web app renders `skills/` as documentation at build
  time (D-015). Never fork a `SKILL.md` into another repository to edit it
  there; fix it here and let the docs build pick it up.
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
4. If you are adding a new skill, also wire it up — the scripts validate shape,
   not coverage, so none of these will fail if you forget:
   - add a row to the Skills table in `README.md`;
   - add a routing row and a worked example in `skills/haikei/SKILL.md`;
   - mention it in the manifest descriptions (`plugin.json`, `.claude-plugin/`,
     `.codex-plugin/`, `.cursor-plugin/`, `.agents/plugins/`) and add any
     keywords it introduces.
5. Add at least two realistic, prompt-only cases in
   `skills/<name>/evals/evals.json`. Keep these portable across Claude Code,
   Cursor, OpenCode, Pi, and Codex. Record expected behavior and assertions;
   never check in results that were not actually run.
6. Run the verification suite before committing:

```bash
node scripts/verify-skills.mjs
node scripts/verify-manifests.mjs
node scripts/check-internal-links.mjs
node scripts/verify-evals.mjs
```

These run in CI as well (Node 22), on pull requests and pushes to `main`.

7. Run the evals for any skill you add or change, with and without the skill,
   and include the pass rates in the pull request:

```bash
node scripts/run-evals.mjs --skill <name>                     # Claude Code (default)
node scripts/run-evals.mjs --skill <name> --harness codex     # or opencode
```

Each case runs in a scratch project with the skill installed in that harness's
project skill directory (`.claude/skills`, `.agents/skills`, `.opencode/skills`)
and again without it. The harness gets read-only tools, and a `claude -p`
grader checks every expectation. Results go to `evals-out/` (ignored by git).
Open them with skill-creator's `eval-viewer/generate_review.py`. The script
exits non-zero if the skill passes under half of its expectations. It calls
models, so it is not part of CI. Write expectations the grader can check from
the answer alone: name the allowed commands instead of "commands in the CLI
help", because the grader cannot see the help output.

## Licensing and naming

This repository is `HaikeiLabs/skills`, public, under the **MIT** licence. Do
not add third-party code or content that is not MIT-compatible.

`main` is protected: no direct pushes. Every change lands through a pull
request that a code owner has approved — see `CODEOWNERS`.
