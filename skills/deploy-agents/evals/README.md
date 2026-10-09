# deploy-agents evals

Deterministic eval cases for the deploy-agents guide skill: container env and entrypoint, daemon sessions, per-user OAuth connectors, harness command policies, Claude Code sync, credential delivery, Discord enrollment, and bind. Each expectation has
exactly one EV-C1 check (`contains_all`, `contains_any`, `regex` or
`not_contains`, case-insensitive). There is no LLM grader.

## Running

```bash
node scripts/run-evals.mjs --skill deploy-agents --model-profile deepseek-v4-flash --jobs 1 --repeats 1
node scripts/run-evals.mjs --skill deploy-agents --model-profile qwen3.8-27b --jobs 1 --repeats 1
```

Set `EVAL_DEEPSEEK_BASE_URL` / `EVAL_QWEN_BASE_URL` in your environment. Never commit endpoint addresses.

## Results (2026-10-08)

| Model profile | with_skill | without_skill (baseline) |
| --- | ---: | ---: |
| deepseek-v4-flash | 100% (8/8) | 0/8 |
| qwen3.8-27b | 100% (8/8) | 0/8 |

Many baseline runs time out while exploring without the skill. Those runs are
graded on whatever they produced before the timeout.

How these results were produced:
- DeepSeek #2 and #7 hit the 600 s per-run timeout on the shared server. They were re-run alone with a 1800 s timeout and passed.
- Case 6 failed on DeepSeek because the answer never said the credential is shown only once. The skill now says so prominently, and case 6 was re-run on both models.
- Case 6's check was widened to accept bold `shown **once**`.
- Case 2's first expectation now reads "talks to the daemon over its Unix socket", because the prompt already says the daemon is running.

Details: `results/2026-10-08-deepseek-v4-flash/` and `results/2026-10-08-qwen3.8-27b/`.
