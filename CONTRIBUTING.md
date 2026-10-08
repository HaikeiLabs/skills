# Contributing to the Haikei skills repo

Keep skills small: help agents find the right product and the right documentation
instead of maintaining another copy of it.

## Ground rules

- **Skills document existing behavior. They never invent APIs.** If a skill names
  a command, endpoint, flag, or type that does not exist in the code, the code
  wins. Update the skill.
- **Prefer retrieval over pre-training.** Point agents at the authoritative
  source — the `kei` CLI usage string, the Kei API route table, the
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

For **governed connector skills** (skills that wrap a third-party API or CLI
for use with `kei-proxy connector invoke`), start from the connector-skill
template. The [`templates/connector-skill/TUTORIAL.md`](templates/connector-skill/TUTORIAL.md)
walks through every step: fork the template, fill in Lexicon/Pragmatics/Semantics,
write evals, run verification, and open a PR.

For all other skills:

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
yamllint -c .yamllint.yml --no-warnings .
node scripts/lint-frontmatter.mjs
node scripts/verify-skills.mjs
node scripts/verify-manifests.mjs
node scripts/check-internal-links.mjs
node scripts/verify-evals.mjs
```

These run in CI as well (Node 22, Python yamllint), on pull requests and pushes to `main`.

7. Run the evals for any skill you add or change with the required model
   profiles, with and without the skill, and include both pass rates in the PR:

```bash
node scripts/run-evals.mjs --skill <name> --model-profile deepseek-v4-flash --jobs 1 --repeats 1
node scripts/run-evals.mjs --skill <name> --model-profile qwen3.8-27b --jobs 1 --repeats 1
node scripts/run-evals.mjs --skills-dir ~/code/haikei/ev-wt/sk-int-kei/skills \
  --skill kei-api-gateway --harness opencode --model-profile deepseek-v4-flash --jobs 1
```

`--skills-dir` defaults to this repository's `skills/`; point it at another
repo's `skills/` directory or at `.agents/skills` to run an internal skill.
The selected source directory is read for skill files and eval fixtures, while
all generated results stay under `--out` (or the default `evals-out/`).

Each case runs in a scratch project with the skill installed in that harness's
project skill directory (`.opencode/skills`) and again without it. The runner
uses the selected model to generate responses, so responses can vary between
runs. It grades them with deterministic, case-insensitive checks from each
eval's `checks` array; there is no LLM grader. A case passes only when every
repeat passes. Results go to `evals-out/` (ignored by git), including
`benchmark.json` and `benchmark.md`. The default threshold is 0.9. The profiles
resolve their OpenCode model names from `evals/model-profiles.yaml`; `--model`
can select an explicit model, and `--repeats N` controls response repetitions
(default 1).

Each harness run is killed after a timeout, set by `--run-timeout <seconds>`,
then the profile's `run_timeout_seconds` in `evals/model-profiles.yaml`, then
600 seconds. `qwen3.8-27b` uses 1800 because opencode runs on the shared GPU
can exceed 600; `deepseek-v4-flash` uses the default. A run that hits the
timeout gets `"timed_out": true` in its `timing.json`. It counts as a benchmark
error with reason `timeout`, and the runner prints
`N runs timed out after Xs`. If a whole sweep times out, raise
`--run-timeout` rather than reading the 0% as a skill failure.

Every run is sandboxed so the score measures what the skill teaches, not what
the model can find on disk or online. The harness may load the skill and
answer, and nothing else. The sandbox is the same for `with_skill` and
`without_skill`; the only difference is whether the skill is installed. The
configuration lives in `scripts/lib/harnesses.mjs` and is covered by
`scripts/lib/harnesses.test.mjs`:

- **opencode** (inline config; keys from opencode's config schema):
  - Permissions deny everything (`"*": "deny"`), so subagents (`task`),
    `bash`, `edit`/`write`/`patch`, `glob`, `grep`, `list`, `webfetch`,
    `websearch` and the rest are not offered to the model at all.
  - `skill` allows only the skill under test.
  - `read` is allowed only under `.opencode/skills/`, for the skill's own
    reference files. The `skill` tool injects `SKILL.md` itself.
  - The run ignores your own opencode setup: an empty config home, no
    `OPENCODE_CONFIG`, and pure mode. A personal `opencode.json`, its
    instructions, its `external_directory` allowlist, and global skills and
    plugins never reach an eval.
- **Claude Code:** `--tools Skill,Read`, project settings only, and no MCP
  servers. Headless mode denies reads outside the scratch project.
- **Codex:** read-only sandbox, with web search, subagents (`multi_agent`),
  apps, browsing, computer use and image generation disabled. Codex has no
  per-path read rule and loads skills through its read-only shell, so it can
  still read other files on disk.

If a skill needs a tool to answer, that's a finding about the skill, not a
reason to widen the sandbox.

CI currently runs `verify-evals` non-strict while
skill eval fixtures migrate. Use `node scripts/verify-evals.mjs --strict` to
require one check per expectation.

## Licensing and naming

This repository is `HaikeiLabs/skills`, public, under the **MIT** licence. Do
not add third-party code or content that is not MIT-compatible.

`main` is protected: no direct pushes. Every change lands through a pull
request that a code owner has approved — see `CODEOWNERS`.
