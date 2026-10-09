# Test AI agents with table tests, not vibes

*Part 2 of 3: build, test, deploy.*

Ask a team how they test their agent and you usually hear one of two answers:
"we try it" or "another model grades it". The first doesn't scale. The second
gives you a score that moves when the grader's mood does.

At HaikeiLabs every agent and every skill is tested the way you'd test a
parser: a **table of inputs and expected outputs, checked by code**, counted
pass or fail. No model grades another model. A result is reproducible, and a
regression is a diff you can read.

We hold two bars:

- **90% or better** per suite, per model, on your machine before you open a
  pull request.
- **95% or better** per suite, per model, in CI, or the check fails.

## Two things to test

- **Agents.** Given this system prompt and these tool schemas, does the model
  call the right tool with the right arguments, and stay away from the wrong
  ones? These live as JSON suites in the repo that owns the agent.
- **Skills.** Given this `SKILL.md`, does a coding agent with the skill
  installed answer a developer's question correctly? These live next to the
  skill.

Both produce the same benchmark file, so one CI gate can read either.

## Writing an agent suite

A suite is data, not code: a system prompt, the rendered tools, and a list of
cases. Here are three cases for Pedro, the agent from Part 1:

```json
{
  "schema": "agentware.eval-suite.v1",
  "suite": "my-harness.pedro",
  "kind": "agent",
  "system_prompt_file": "prompts/pedro.md",
  "tools": [ "…rendered with render_tools(..., ModelFormat.OPENAI)…" ],
  "repeats": 3,
  "cases": [
    { "id": "file-bug-named-team",
      "prompt": "File a bug for the OPS team: nightly backups have failed silently since Monday.",
      "context": { "role": "member", "groups": ["default"],
                   "allowed_tools": ["file_bug", "search_wiki", "web_search"] },
      "expect": { "tool": "file_bug",
                  "args": { "team_key": "OPS", "severity": "critical" },
                  "required_arg_keys": ["title", "description"],
                  "forbidden_arg_keys": ["tenant_id", "org_id", "workspace", "workspace_id", "repository"] } },
    { "id": "greeting-no-tool", "prompt": "Hi Pedro, how are you?", "expect": { "tool": null } },
    { "id": "member-denied-crm", "prompt": "List every lead in the CRM.",
      "context": { "role": "member", "groups": ["default"],
                   "allowed_tools": ["file_bug", "search_wiki", "web_search"] },
      "expect": { "deny": true, "content": { "not_contains": ["here are the leads"] } } }
  ]
}
```

Read them as sentences:

1. When someone asks to file a backup bug for OPS, the first call is
   `file_bug`, in team `OPS`, at severity `critical`, with a title and a
   description, and **no** tenant, workspace, or repository argument. That last
   part enforces the "scope is never an argument" rule from Part 1.
2. When someone says hello, **no tool is called at all** (`"tool": null`).
   Leaving `tool` out entirely would mean "don't check the first tool".
3. When a member of the default group asks for CRM data, the policy **denies**
   it and the reply doesn't pretend otherwise.

That third case is worth a closer look. `allowed_tools` isn't a hint to the
model; the runner turns it into a real agentware default-deny policy. The case
passes if the policy blocks the attempt (or the model never tries) and the
reply says so. The model never sees the caller's role, because in production
access is enforced by policy, so that is what we test.

Every case can also check the final reply: `contains_all`, `contains_any`,
`regex`, `not_contains`, all case-insensitive. And `"repeats": 3` means each
case runs three times and passes only if **all three** pass. Flaky is failing.

Two habits help. First, generate the suite from code, so a change to a tool
description shows up as a diff in the suite. kei-agents does this, and its CI
fails when the committed suites are stale. Second, the loader is strict: an
unknown key, a duplicate id, or a deny case without `allowed_tools` is
rejected before a single model call.

## Model profiles

You run a suite against a named **model profile**, not a URL:

```yaml
profiles:
  deepseek-v4-flash:
    backend: vllm
    model: deepseek-ai/DeepSeek-V4-Flash
    base_url_env: EVAL_DEEPSEEK_BASE_URL
    concurrency: 4
  qwen3.8-27b:
    backend: llamacpp
    model: qwen3.8-27b
    base_url_env: EVAL_QWEN_BASE_URL
    concurrency: 2
```

The file names the *environment variable* that holds the endpoint, never the
endpoint itself. Each developer and each CI runner sets its own. Endpoint
addresses never go into a repository.

## Running it

The canonical runner is agentware's Python eval package:

```bash
export EVAL_DEEPSEEK_BASE_URL=...      # your OpenAI-compatible /v1 endpoint
PYTHONPATH=agentware/python/src python -m evals.main \
  --suite evals/suites --model-profile deepseek-v4-flash \
  --out evals-out/deepseek --jobs 1
```

Then run it again with `--model-profile qwen3.8-27b`. A suite that passes on
one model and not the other usually has a prompt or tool description that
only works by luck.

The exit code tells you what happened:

- **0** — every suite met the threshold (95% by default).
- **1** — a suite fell below it.
- **2** — the model endpoint couldn't be reached, or the run was misconfigured.
  This is **never scored**. An outage is not a 0%.

The run writes `benchmark.json` and a readable `benchmark.md` with each suite's
pass rate and, for each failing case, the reason ("first call was
create_issue, expected file_bug"; "forbidden argument tenant_id"). Use `--case`
to re-run just the failures, and `--transcripts` to see exactly what the model
did.

When a case fails, **fix the prompt or the tool description, not the case.**
The case is the spec.

## Testing a skill

Skills are tested the same way, with a simpler file. Each eval is a question,
a list of expectations, and one deterministic check per expectation:

```json
{ "id": 1,
  "prompt": "How do I create a Linear issue through the governed connector?",
  "expectations": ["mentions issueCreate", "includes the parent teamId", "does not suggest deleting"],
  "checks": [
    { "text": "mentions issueCreate", "contains_any": ["issueCreate"] },
    { "text": "includes the parent teamId", "regex": "team_?id" },
    { "text": "does not suggest deleting", "not_contains": ["deleteIssue"] } ] }
```

The skills runner answers each question twice, in a clean scratch project:
once with the skill installed and once without. The "without" number is the
baseline that shows what the skill actually teaches. The answer key never
goes into the sandbox.

```bash
node scripts/run-evals.mjs --skill my-skill --model-profile deepseek-v4-flash --jobs 1 --repeats 1
node scripts/run-evals.mjs --skill my-skill --model-profile qwen3.8-27b --jobs 1 --repeats 1
```

## The CI gate

Each repository carries one workflow, copied from a shared template, with two
blocks you edit: which paths trigger it, and which suites to run. On every
pull request it runs the suites on each model profile and posts a **single
sticky comment**, updated in place, with a suite-by-model table. The check
fails when any suite drops **below 95% on any model**, or when a model server
can't be reached (shown as unreachable, never as a score).

A few design choices keep it honest:

- **The grader is pinned by commit.** A pull request can change its suites
  but not the code that grades them.
- **Same-repository pull requests only.** Forks never get a runner, and the
  workflow never uses `pull_request_target`.
- **Least privilege.** Only the job that posts the comment can write to the
  pull request, and it runs no repository code.

## What evals don't prove

These evals measure how a model uses your prompt and schemas, with mocked
tools. They don't call real providers, and passing them doesn't mean your
policy is right. You prove the policy separately, by watching a real deny
happen in the deployed runtime. That's the last step of Part 3.

**Next:** [Part 3 — deploy and distribute your agent](deploy-and-distribute-agents.md).
**Previous:** [Part 1 — build agents with the agentware SDK](build-agents-with-agentware.md).
