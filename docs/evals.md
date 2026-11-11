# Evals

Two eval systems run here. Both grade with deterministic checks and no LLM
judge. One tests skills: does a coding agent find, load and follow a skill.
The other tests agents: does a model call the right tool with the right
arguments.

| | Skill evals | Agentware evals |
| --- | --- | --- |
| Question it answers | Does the skill change what the agent does? | Does the model call the right tool with the right arguments? |
| Cases live in | `skills/<skill>/evals/evals.json` | `evals/suites/*.json` in the repo that owns the agent |
| Runner | `scripts/run-evals.mjs` (this repo) | `python -m evals.main` (HaikeiLabs/Agentware, `python/src/evals`) |
| What runs | A real coding agent, headless | Our own headless runner; no third-party agent |
| CI gate | `.github/workflows/agent-evals.yaml`, `EVAL_KIND: skill` | The same workflow template, `EVAL_KIND: agent` |

Both write the same benchmark schema, `haikei.eval-benchmark.v1`, so one
report job can read either.

## Skill evals

Each case is a question (`prompt`), what a good answer contains
(`expectations`), and how to check it (`checks`). The `expectations` text is
for humans. The `checks` are what gets scored: one check per expectation, and
the check's `text` must match its expectation verbatim.

The runner creates two scratch projects per case: one with the skill installed
and one without. Only the skill's teaching content is staged. `evals/` (the
answer key) is never staged, and the sandbox denies reads outside the scratch
project, so the score measures what the skill teaches, not what the model can
find on disk. The harness may load the skill and read its reference files;
subagents, shell, edits, web search and user-level skills are all denied.

The headless harness is `opencode` in CI. The runner also supports
`--harness claude`, `codex` and `pi` for local runs. Pi is not in the runner
image, so the gate runs opencode.

## Agentware evals

A suite (`agentware.eval-suite.v1`) is a system prompt, the rendered tools,
and a list of cases. A case maps a prompt to an expected outcome: the first
tool called (`tool`), its arguments (`args`, `required_arg_keys`,
`forbidden_arg_keys`), tools that must never be called (`forbidden_tools`),
content checks on the reply, and `deny` cases.

The runner drives its own tool loop with mock executors, so no third-party
agent is involved. When a case sets `allowed_tools`, the runner builds a real
default-deny Kei policy: a disallowed call is refused by the middleware, and
the case tests the policy, not the model's manners.

The loader is strict: an unknown key, a duplicate id, or a deny case without
`allowed_tools` is rejected before a model is called.

## Grading: deterministic checks, sampled answers

The checks are code, so the same answer always gets the same grade. The answer
itself is sampled. The model profiles in `evals/model-profiles.yaml` fix the
sampling so a rerun of an unchanged skill asks the same question the same way:

- `glm-5.3-flash`: temperature 0, seed 42, thinking on.
- `qwen3.8-27b`: temperature 0.6, top_p 0.95, top_k 20, seed 42, thinking on.
  Greedy sampling makes Qwen loop with thinking on, so it uses its recommended
  thinking-mode sampling instead.

Both profiles send `thinking` under both spellings the servers use
(`enable_thinking` and `thinking`), so the run does not depend on the server's
default.

Deterministic checks do not mean deterministic results: a run can miss a
check and a rerun can pass. That is why the nightly sweep repeats each case
3 times and averages. A suite scores passed runs / total runs. One miss is
not a regression; check whether the same case fails across runs.

## The CI gate

Each repository carries its own copy of the workflow template from
HaikeiLabs/kei (`docs/agent-evals-gate.md` there is the runbook). In this repo
it is `.github/workflows/agent-evals.yaml`.

On a pull request it runs the suites the pull request changes, once per case,
with a 30-minute job limit. It fails when any suite scores below 90% on either
model profile (`EVAL_THRESHOLD: "0.90"`; the Agentware repo sets 95%). A pull
request that changes no suite passes with "no eval-relevant changes". One
sticky comment holds the suite-by-model table.

Every night at 09:00 UTC (and on demand with workflow_dispatch) the default
branch runs every suite 3 times per case with a 110-minute job limit. That
averaged sweep is the record. A failing sweep opens or updates the
"Nightly agent evals below 90%" issue; a passing sweep closes it.

Other things the gate does:

- **Shards.** A suite with more runs than a shard holds is split, so each job
  fits the timeout. Shard size comes from the profile's `shard_runs` (8 here),
  and nightly shards are 3 times larger. GLM runs 2 evals at once, Qwen 1.
- **The grader is pinned.** `EVAL_RUNNER_REF` pins a commit of this repo, so
  a pull request can change its suites but not the code that grades them.
- **evals:tuning label.** While a pull request carries it, nothing runs and
  the gate fails with "evals:tuning is set: remove the label to run the gate
  before merge". Remove the label only when the suite reaches 90% locally on
  both profiles at `--repeats 3`.
- **A model server that does not answer is "models unreachable", never a
  score.** An outage is not a 0%.
- **Fork pull requests never reach the self-hosted runners.**
- **Closing or merging a pull request cancels its eval run.**

## Long cases

A case marked with a `long` flag will run nightly only; a pull request opts in
with the `evals:long` label. This is being added; until it lands, pull
requests run long cases too.

## Where it runs

The gate runs on self-hosted runner scale sets in kei-cluster:
`kei-agent-evals` (GLM jobs) and `kei-agent-evals-qwen` (Qwen jobs). The
runner image is built from kei `infra/images/agent-evals-runner`: node 22,
python3 with uv, opencode 1.18.32, git and gh.

## Why opencode, and what moving to Pi would take

The gate runs opencode because that is what the runner image ships and what
the pinned grader calls. The runner already knows Pi: `--harness pi` exists in
`scripts/lib/harnesses.mjs` and works for local runs. Moving the gate to Pi
takes two changes: add Pi to the runner image (bump the image `VERSION` in
kei `infra/images/agent-evals-runner` and retag
`infra/github-actions-runner/agent-evals-runner-values.yaml`), and switch the
workflow's `--harness opencode` to `pi`.

## Running locally

```bash
node scripts/run-evals.mjs --skill <name> --model-profile glm-5.3-flash --jobs 1 --repeats 3
node scripts/run-evals.mjs --skill <name> --model-profile qwen3.8-27b --jobs 1 --repeats 3
```

Qwen is served by one GPU that the CI gate shares, so run it at `--jobs 1`,
one suite at a time. Results go to
`evals-out/`, which git ignores. Do not commit them: the CI gate and its
sticky pull request comment are the record. Local runs are for tuning.

Exit codes: 0 every suite at or above the threshold, 1 a suite below it,
2 a run that did not complete (endpoint unreachable, harness failure, usage
error). Exit 2 is never scored.

More on writing cases: [CONTRIBUTING.md](../CONTRIBUTING.md). A worked
example of the case format: [test-agents-with-table-tests.md](guides/test-agents-with-table-tests.md).
