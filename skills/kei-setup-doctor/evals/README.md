# kei-setup-doctor evals

Eval cases for the setup doctor skill.

## Running

Checks are deterministic (case-insensitive string checks in `evals.json`, no
LLM grader). The CI gate (`.github/workflows/agent-evals.yaml`) runs every
case 3 times per model profile at temperature 0 with a fixed seed, and gates
on the average pass rate (threshold 0.90). To reproduce it locally:

```bash
node scripts/run-evals.mjs --skill kei-setup-doctor --harness opencode \
  --model-profile glm-5.3-flash --repeats 3 --jobs 1 \
  --out evals-out/kei-setup-doctor-glm-$(date +%F)
node scripts/run-evals.mjs --skill kei-setup-doctor --harness opencode \
  --model-profile qwen3.8-27b --repeats 3 --jobs 1 \
  --out evals-out/kei-setup-doctor-qwen-$(date +%F)
```

`evals-out/` is ignored by git. Don't commit local benchmark results; the CI
gate's report is the record.

## Cases

Cases 11 and 12 cover identity-mode connector denials (HAI-378): `credential_unavailable` (connector reference index, `credential sync`, state directory, redelivery) and `credential_backend_mismatch` (redeliver to the current credential store).

## Results

### 2026-10-06 (eval cases 9-10)

| Config | Pass rate | Errors |
| --- | --- | --- |
| with_skill | 76% (22/29) | 0 |
| without_skill | 0% (0/6) | 8 |

Added eval cases 9 (stale policy bundle, HAI-403) and 10 (stale proxy cache,
HAI-404). with_skill improved from 71% to 76%. without_skill had 8 incomplete
runs (permission rejections or glob timeouts in the opencode harness); only
evals 2 and 10 completed.

See `results/2026-10-06-opencode-deepseek-v4-flash/` for detailed outputs.

### 2026-10-02 (baseline)

| Config | Pass rate | Errors |
| --- | --- | --- |
| with_skill | 71% (15/21) | 0 |
| without_skill | 13% (2/16) | 2 |

See `results/2026-10-02-opencode-deepseek-v4-flash/` for detailed outputs.

### 2026-10-07 (new/changed evals from #51)

| Config | Pass rate | Errors |
| --- | --- | --- |
| with_skill | 80% (4/5) | 0 |
| without_skill | — | — |

Ran the new/changed eval (ID 9) that was modified by PR #51 (harness-add
clarifications). Run with `--no-baseline` so no without_skill comparison data
is available.

See `results/2026-10-07-opencode-deepseek-v4-flash/` for detailed outputs.

### 2026-10-07 (full benchmark)

| Config | Pass rate | Errors |
| --- | --- | --- |
| with_skill | 70% (21/30) | 0 |
| without_skill | 13% (4/30) | 0 |

Full benchmark of all 10 eval cases. The runner now treats harness
permission-rejection errors as completed (failing) runs instead of
infrastructure errors, so all 20 without_skill runs completed and were graded
(previous runs had 8 incomplete runs due to permission rejections).

See `results/2026-10-07-opencode-deepseek-v4-flash/` for detailed outputs.

### 2026-10-08 (deterministic grading, full benchmark)

| Config | Pass rate | Errors |
| --- | --- | --- |
| with_skill | 47% (14/30) | 0 |
| without_skill | 0% (0/30) | 0 |

Full benchmark of all 10 eval cases using deterministic checks (no LLM grader).
with_skill dropped from 70% to 47% — the LLM grader was more lenient; deterministic
checks require exact content matches. without_skill is 0% as expected.

See `results/2026-10-08-opencode-deepseek-v4-flash/` for detailed outputs.
