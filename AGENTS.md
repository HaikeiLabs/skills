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
2. **Temperature 0, no thinking, repeats averaged.** The model profiles in
   `evals/model-profiles.yaml` set `temperature: 0`, a fixed `seed` and
   `thinking: false`, and both runners send them with every request. Run each case 2-3 times
   (`--repeats 3`). A suite scores passed runs / total runs, averaged the same
   way as tool-call evals, so one miss isn't a regression. Check whether the
   same case fails across runs.
3. **95% per suite per model.** The gate fails when any suite is below 95% on
   either model profile, `deepseek-v4-flash` or `qwen3.8-27b`. Aim for at least
   90% locally before you open a pull request.
4. **Who authors pull requests.** Every worker commit, push and PR is
   AgentPedro's (see the `kei-worker-git-identity` skill), never the owner's.
   If AgentPedro can't push a change, for example a `.github/workflows/*` file
   while its token has no Workflows permission, stop that change and record a
   blocker instead of using another account.
5. **Local Qwen runs take the Qwen lock.** Qwen is served by a single GPU that
   the CI gate shares, and the gate runs it at concurrency 1. Run every local
   `qwen3.8-27b` eval through the worker host's turnlock, whose Qwen queue has
   1 slot, at `--jobs 1` and one suite per ticket:

   ```sh
   turnlock.sh qwen <worker> node scripts/run-evals.mjs --skill <name> \
     --model-profile qwen3.8-27b --jobs 1 --repeats 3
   ```
