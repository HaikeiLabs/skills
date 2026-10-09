# kei-harness-setup evals

Eval cases for the harness setup skill.

## Running

```bash
node scripts/run-evals.mjs --skill kei-harness-setup --harness opencode \
  --model ray/deepseek-ai/DeepSeek-V4-Flash \
  --out evals-out/kei-harness-setup-deepseek-$(date +%F) --jobs 2
```

## Results

### 2026-10-06 (eval cases 7-8)

| Config | Pass rate | Errors |
| --- | --- | --- |
| with_skill | 75% (18/24) | 1 |
| without_skill | 0% (0/2) | 7 |

Added eval cases 7 (fresh macOS setup script) and 8 (stale policy bundle,
HAI-403). with_skill improved from 60% to 75%. Eval 1 (with_skill) errored
due to a permission rejection. without_skill had 7 incomplete runs (permission
rejections or glob timeouts in the opencode harness); only eval 4 completed.

See `results/2026-10-06-opencode-deepseek-v4-flash/` for detailed outputs.

### 2026-10-05 (added troubleshooting eval 6)

| Config | Pass rate | Errors |
| --- | --- | --- |
| with_skill | 60% (12/20) | 0 |
| without_skill | 0% (0/6) | 4 |

Added eval 6 for HAI-372 (policy bundle schema rejection — dst_pattern without
tool: prefix). without_skill had 4 incomplete runs (permission rejections in the
opencode harness), so the 0% figure is based on only 6 completed evaluations.
With the skill the new eval passed 4/4 expectations.

See `results/2026-10-05-opencode-deepseek-v4-flash/` for detailed outputs.

### 2026-10-02 (baseline)

| Config | Pass rate | Errors |
| --- | --- | --- |
| with_skill | 44% (4/9) | 0 |
| without_skill | 11% (1/9) | 0 |

See `results/2026-10-02-opencode-deepseek-v4-flash/` for detailed outputs.

### 2026-10-07 (new/changed evals from #51)

| Config | Pass rate | Errors |
| --- | --- | --- |
| with_skill | 54% (7/13) | 0 |
| without_skill | error | 1 |

Ran the new/changed evals (IDs 7, 8, 9) that were modified by PR #51 (harness-add
clarifications). Eval 8 and 9 were run with `--no-baseline` (no without_skill
runs). Eval 7's without_skill run errored with a permission rejection — the
model needs the skill to answer Kei-specific questions.

See `results/2026-10-07-opencode-deepseek-v4-flash/` for detailed outputs.

### 2026-10-07 (full benchmark)

| Config | Pass rate | Errors |
| --- | --- | --- |
| with_skill | 58% (19/33) | 0 |
| without_skill | 3% (1/33) | 0 |

Full benchmark of all 9 eval cases. The runner now treats harness
permission-rejection errors as completed (failing) runs instead of
infrastructure errors, so all 18 without_skill runs completed and were graded
(previous runs had 7+ incomplete runs due to permission rejections).

See `results/2026-10-07-opencode-deepseek-v4-flash/` for detailed outputs.

### 2026-10-08 (deterministic grading, full benchmark)

| Config | Pass rate | Errors |
| --- | --- | --- |
| with_skill | 55% (18/33) | 0 |
| without_skill | 0% (0/33) | 0 |

Full benchmark of all 9 eval cases using deterministic checks (no LLM grader).
with_skill held roughly steady (55% vs 58%). without_skill is 0% as expected.

See `results/2026-10-08-opencode-deepseek-v4-flash/` for detailed outputs.
