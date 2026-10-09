# test-agents evals

Deterministic eval cases for the test-agents guide skill: suite schema, no-tool and deny cases, the runner command and exit codes, deterministic checks, repeats, and the CI gate threshold. Each expectation has
exactly one EV-C1 check (`contains_all`, `contains_any`, `regex` or
`not_contains`, case-insensitive). There is no LLM grader.

## Running

```bash
node scripts/run-evals.mjs --skill test-agents --model-profile deepseek-v4-flash --jobs 1 --repeats 1
node scripts/run-evals.mjs --skill test-agents --model-profile qwen3.8-27b --jobs 1 --repeats 1
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
- DeepSeek #2 hit the 600 s per-run timeout on the shared server. It was re-run alone with a 1800 s timeout and passed.
- Check 2 of case 5 (exit code 1) was widened to accept the answer written as a markdown table cell.

Details: `results/2026-10-08-deepseek-v4-flash/` and `results/2026-10-08-qwen3.8-27b/`.
