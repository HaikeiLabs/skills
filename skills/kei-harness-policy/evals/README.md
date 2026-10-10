# kei-harness-policy evals

Eval cases for the harness command policy skill.

## Running

```bash
node scripts/run-evals.mjs --skill kei-harness-policy --harness opencode \
  --model ray/deepseek-ai/DeepSeek-V4-Flash --jobs 2
```

## Cases

- Eval 13 covers where Claude Code native decisions are recorded (the `decision` event) and the Claude Code 2.1.119 minimum. Not run yet; add its results here after the next benchmark.

## Results

| Config | Pass rate | Errors |
| --- | --- | --- |
| with_skill | 84% (21/25) | 0 |
| without_skill | 0% (0/25) | 0 |

See `results/2026-10-02-opencode-deepseek-v4-flash/` for detailed outputs.

### 2026-10-07 (new/changed evals from #51)

| Config | Pass rate | Errors |
| --- | --- | --- |
| with_skill | 67% (6/9) | 0 |
| without_skill | 0% (0/9) | 0 |

Ran the new/changed evals (IDs 1, 12) that were modified by PR #51 (harness-add
clarifications). without_skill scored 0% — the model does not know Harness
Command Policy details without the skill.

See `results/2026-10-07-opencode-deepseek-v4-flash/` for detailed outputs.

### 2026-10-07 (full benchmark)

| Config | Pass rate | Errors |
| --- | --- | --- |
| with_skill | 82% (40/49) | 0 |
| without_skill | — | — |

Full benchmark of all 12 eval cases. Run with `--no-baseline` so no without_skill
data was collected. The runner now treats harness permission-rejection errors as
completed (failing) runs instead of infrastructure errors.

See `results/2026-10-07-opencode-deepseek-v4-flash/` for detailed outputs.

### 2026-10-08 (deterministic grading, full benchmark)

| Config | Pass rate | Errors |
| --- | --- | --- |
| with_skill | 63% (31/49) | 0 |
| without_skill | 2% (1/49) | 0 |

Full benchmark of all 12 eval cases using deterministic checks (no LLM grader).
with_skill dropped from 82% to 63% — the LLM grader was more lenient; deterministic
checks require exact content matches. without_skill baseline is near-zero as
expected.

See `results/2026-10-08-opencode-deepseek-v4-flash/` for detailed outputs.

