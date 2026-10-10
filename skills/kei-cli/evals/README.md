# kei-cli evals

Eval cases for the kei CLI skill.

## Running

```bash
EVAL_DEEPSEEK_BASE_URL=<openai-compatible endpoint> \
  node scripts/run-evals.mjs --skill kei-cli \
  --model-profile deepseek-v4-flash \
  --out evals-out/kei-cli-deepseek-$(date +%F) --jobs 2
```

The runner gives opencode an empty config home, so a provider from your own
opencode config (`--model <provider>/...`) is not visible to it. Use
`--model-profile`, which resolves the model and endpoint from
`evals/model-profiles.yaml`.

## Results

### 2026-10-09 (added bug-report eval 14)

Eval 14 asks how to send the Kei team a bug report with a specific Codex
session attached, and what happens to API keys in the transcript.

| Config | Pass rate | Notes |
| --- | --- | --- |
| with_skill (eval 14) | 100% (5/5) | `kei feedback --description ... --export codex --session ID`, redaction, preview and `Send? [y/N]` |
| without_skill (eval 14) | 0% (0/5) | baseline does not know `kei feedback` |

Eval 14 was run in isolation (DeepSeek-V4-Flash, one repeat). The preview
check was widened after the run to accept the `[y/N]` prompt as well as the
word "confirm", and the saved responses were regraded; the scores above are
from the regrade.

See `results/2026-10-09-opencode-deepseek-v4-flash/` for the benchmark.

### 2026-10-05

| Config | Pass rate | Errors |
| --- | --- | --- |
| with_skill | 79% (23/29) | 0 |
| without_skill | 8% (2/24) | 0 |

Added troubleshooting evals 9 (HAI-374 runtime bootstrap state dir) and 10
(HAI-373 policies list decode error). The new evals 9–10 passed 5/6 with the
skill; the single failure was on eval 10 without_skill (agent did not know
about the kei upgrade path). without_skill still shows low pass rates as
expected — the skill is the only source for these Kei-specific details.

See `results/2026-10-05-opencode-deepseek-v4-flash/` for detailed outputs.

### 2026-10-05 (previous, added troubleshooting evals 6–8)

| Config | Pass rate | Errors |
| --- | --- | --- |
| with_skill | 75% (15/20) | 0 |
| without_skill | 40% (2/5) | 6 |

The login troubleshooting evals (6–8) all passed 3/3 with the skill.
without_skill had 6 incomplete runs (permission rejections in the opencode
harness), so the 40% figure is based on only 2 completed evaluations.

See `results/2026-10-05-opencode-deepseek-v4-flash/` for detailed outputs.

### 2026-10-02 (baseline)

| Config | Pass rate | Errors |
| --- | --- | --- |
| with_skill | 73% (8/11) | 0 |
| without_skill | 22% (2/9) | 1 |

See `results/2026-10-02-opencode-deepseek-v4-flash/` for detailed outputs.

### 2026-10-07 (new/changed evals from #51)

| Config | Pass rate | Errors |
| --- | --- | --- |
| with_skill | 75% (3/4) | 0 |
| without_skill | 0% (0/4) | 0 |

Ran the new/changed eval (ID 13) that was added by PR #51 (harness-add
clarifications). without_skill scored 0% — the model does not know Kei CLI
details without the skill.

See `results/2026-10-07-opencode-deepseek-v4-flash/` for detailed outputs.

### 2026-10-07 (full benchmark)

| Config | Pass rate | Errors |
| --- | --- | --- |
| with_skill | 86% (37/43) | 0 |
| without_skill | — | — |

Full benchmark of all 13 eval cases. Run with `--no-baseline` so no without_skill
data was collected. The runner now treats harness permission-rejection errors as
completed (failing) runs instead of infrastructure errors, so without_skill runs
grade normally.

See `results/2026-10-07-opencode-deepseek-v4-flash/` for detailed outputs.

### 2026-10-08 (deterministic grading, full benchmark)

| Config | Pass rate | Errors |
| --- | --- | --- |
| with_skill | 70% (30/43) | 0 |
| without_skill | 7% (3/43) | 0 |

Full benchmark of all 13 eval cases using deterministic checks (no LLM grader).
with_skill dropped from 86% to 70% — the LLM grader was more lenient; deterministic
checks require exact content matches. without_skill remains low as expected (the
model does not know Kei CLI details without the skill).

See `results/2026-10-08-opencode-deepseek-v4-flash/` for detailed outputs.

