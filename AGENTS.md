# Agent instructions

Guidance for coding agents working in this repository. How to write a skill
and its evals is in [CONTRIBUTING.md](CONTRIBUTING.md).

## Evals

These rules (owner decision, 2026-10-10) apply to every eval and skill change,
whichever harness you work in (Claude Code, Codex, opencode).

1. **CI is the record.** Don't commit local eval results
   (`evals/results/<date>-<model>/benchmark.{json,md}`). The agent-evals CI
   gate and its sticky pull request comment are the record. Local runs are for
   tuning, and their output stays in `evals-out/`, which git ignores.
2. **Thinking on, fixed sampling, repeats averaged.** The model profiles in
   `evals/model-profiles.yaml` set `thinking: true` and a fixed `seed` for
   every model. GLM samples at `temperature: 0`; Qwen uses its
   recommended thinking-mode sampling (`temperature: 0.6`, `top_p: 0.95`,
   `top_k: 20`), because greedy sampling makes it loop with thinking on (owner
   decision 2026-10-13). Both runners send these with every request. Run each case 2-3 times
   (`--repeats 3`). A suite scores passed runs / total runs, averaged the same
   way as tool-call evals, so one miss isn't a regression. Check whether the
   same case fails across runs.
3. **90% per suite per model.** The gate fails when any suite is below 90% on
   either model profile, `glm-5.3-flash` or `qwen3.8-27b`. Reach at least
   90% locally on both before you open a pull request.
4. **Who authors pull requests.** Every worker commit, push and PR is
   AgentPedro's (see the `kei-worker-git-identity` skill), never the owner's.
   If AgentPedro can't push a change, for example a `.github/workflows/*` file
   while its token has no Workflows permission, stop that change and record a
   blocker instead of using another account.
5. **One run on pull requests, three nightly; `evals:tuning` while tuning**
   (owner decision 2026-10-13, HAI-521). The gate runs the changed suites once
   per case on a pull request, and every suite 3 times per case nightly on
   `main` (09:00 UTC, or by hand with workflow_dispatch). The nightly average
   is the record: a failing sweep opens or updates the "Nightly agent evals
   below 90%" issue, and a passing one closes it. While a pull request is
   still tuning a skill, add the `evals:tuning` label: nothing runs, and the
   gate fails with "evals:tuning is set: remove the label to run the gate
   before merge". Remove the label only after the suite reaches at least 90%
   locally on both model profiles at `--repeats 3`. Removing it runs the gate.
   The runbook is HaikeiLabs/kei `docs/agent-evals-gate.md` (Cadence).
6. **Local Qwen runs take the Qwen lock.** Qwen is served by a single GPU that
   the CI gate shares, and the gate runs it at concurrency 1. Run every local
   `qwen3.8-27b` eval through the worker host's turnlock, whose Qwen queue has
   1 slot, at `--jobs 1` and one suite per ticket:

   ```sh
   turnlock.sh qwen <worker> node scripts/run-evals.mjs --skill <name> \
     --model-profile qwen3.8-27b --jobs 1 --repeats 3
   ```
