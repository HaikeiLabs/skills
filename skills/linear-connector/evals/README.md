# linear-connector evals

Deterministic prompt-only cases for issue lookup and issue creation. Each
expectation has a single case-insensitive deterministic check.

Run with `node scripts/run-evals.mjs --skill linear-connector --model-profile glm-5.3-flash --jobs 1 --repeats 3`.
Run Qwen through the worker turnlock as described in `AGENTS.md`.
