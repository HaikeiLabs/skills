---
name: kei-headless-evals
description: Headless, deterministic evaluation harnesses across the Kei repos. Use when running or extending the DVL Assistant's src/eval harness (EvalSuite/EvalCase/EvalTrace/EvalReport, ScriptedBackend, EvalRunner, --backend scripted|agentware, eval/fixtures/*.golden.json), the kei-chat-harness eval harness (eval_harness.py, testing/evals, ModelBackend openai/anthropic/ollama/llamafile/vllm/ollama_direct, eval_results JSONL), or the pedro-agentware evals (python/src/evals, go/evals, typescript/src/evals). Use whenever the task mentions headless evals, golden fixtures, eval suites, eval traces, scripted backends, or agentware runner seams. The agentware backend is intentionally NOT wired yet — do not invent it.
---

# Headless evals

The eval harnesses here are deliberately **headless, deterministic, and offline**: they drive
a JSON `EvalSuite` through a backend and emit a JSON report, with no LLM, no network, and no
product behavior invented. Their job is to pin existing pure helpers and give CI a stable
signal until a real shared agent/tool runner lands.

### Eval report and trace schema

Each eval run produces an `EvalReport` containing one `EvalTrace` per case. A trace
is an ordered list of `EvalTraceStep` objects — each with a kind, a message, and an
optional snapshot. The schema version is pinned in `src/eval/types.ts` as
`dvl.eval-trace.v1` and `dvl.eval-report.v1`; a future schema change must bump the
version constant rather than mutate the existing shape, so historical reports remain
comparable. The report summary includes pass/fail/error counts, total duration, and the
backend version string. Every report field is a frozen serializable JSON value — no
class instances, no `undefined`, no `Date` objects — so `JSON.parse(JSON.stringify(report))`
round-trips identically.

### Trace step kinds

| Kind | Meaning | Has snapshot |
|---|---|---|
| `input` | The raw input fed to the lane | Yes |
| `parse` | Parsed/structured form of the input | Yes |
| `resolve` | Resolved values (selection, scope, roles) | Yes |
| `guard` | The guard decision outcome | Yes |
| `envelope` | The validated execution grant or error | Yes |
| `render` | The rendered markdown reply | Yes |
| `error` | A backend-level error that prevented evaluation | No |
| `aborted` | The case was aborted (AbortSignal) | No |

All snapshots are plain JSON; hostile or cyclic values are replaced with `null` and the
step message records the rejection reason. This ensures a golden fixture can assert any
step's snapshot verbatim.

## Assistant harness (DVL-Group/assistant — `src/eval/`, `eval/`, `test/eval.harness.test.ts`)

The track lives on the `feat/headless-agent-evals` branch (its own git worktree); the files
below are that branch's additions to the repo. If they are absent in the worktree you are in,
work on that branch.

- `src/eval/types.ts` — the JSON contract: `EvalCase` (id, lane, input, label, optional
  pinned `expect`), `EvalSuite`, `EvalTraceStep`, `EvalTrace`, `EvalReport`, and the
  `EvalBackend` interface. Schema versions are pinned constants
  (`dvl.eval-trace.v1`, `dvl.eval-report.v1`). `isEvalCaseId` bounds ids (≤128, no unpaired
  surrogates). Lanes are closed: `project-hours` | `semantic-model`.
- `src/eval/scriptedBackend.ts` — `ScriptedBackend`: answers from a construction-pinned
  script Map, else a deterministic echo path. Hostile inputs (Proxy, class instances, extra
  keys, symbols, accessors) fail closed to `kind: 'error'` without throwing.
- `src/eval/runner.ts` — `EvalRunner` owns the per-case `AbortSignal` and the summary;
  backend-agnostic.
- `src/eval/cli.ts` — the headless CLI:
  `node --experimental-strip-types src/eval/cli.ts --backend scripted --suite <fixture> [--out report.json]`.
  `--backend agentware` is recognized but **not wired**: it exits 2 with a stable stub message.
- `eval/fixtures/*.golden.json` — golden suites for the two lanes
  (`semantic-model-commands.golden.json` pins the closed command router incl. help routing
  and injection-shaped inputs; `project-hours.golden.json` pins the selection validator).
- `test/eval.harness.test.ts` — node:test covering types round-trip, determinism, hostile
  input, aggregation, abort, and both golden fixtures.

Run (from the eval branch):

```bash
node --experimental-strip-types src/eval/cli.ts --help
node --experimental-strip-types src/eval/cli.ts --backend scripted \
  --suite eval/fixtures/semantic-model-commands.golden.json
node --experimental-strip-types src/eval/cli.ts --backend scripted \
  --suite eval/fixtures/project-hours.golden.json --out /tmp/eval-report.json
node --test test/eval.harness.test.ts
```

## Chat harness evals (HaikeiLabs/Kei-Chat-Harness)

- `src/pedro_service/eval_harness.py` — `EvalHarness` with `ModelBackend`
  (`openai`, `anthropic`, `ollama`, `llamafile`, `vllm`, `ollama_direct`), `TestCase`,
  `ModelConfig`; writes JSONL under `./eval_results` (default). `create_test_cases()` ships 13
  cases. This one DOES call a model backend — it is the harness-side, not the assistant-side.
- `testing/evals/` — standalone runner (`runner.py`, `models.py` hitting
  `{base_url}/chat/completions`), `cases/github.py` (GitHub tool-calling cases), `main.py`
  CLI: `python -m testing.evals.main [--github|--all] [--models ...] [--base-url ...]`.
  Existing artifacts in `testing/evals/output/*.json` and `eval_results/*.jsonl`.
- Validation: `uv run pytest tests/test_eval_harness.py tests/test_headless_harness.py -q`
  (headless is the offline path; the model-backed suites are marked `integration`).

### The `--backend agentware` stub

The CLI recognizes `--backend agentware` but exits 2 immediately with the stable message
`"eval harness ready — agentware backend not wired (exit 2)"`. This stub exists so CI and
the deployment contract can assert the harness binary is the expected version without
requiring a real agent backend. When the real backend is implemented, it must:

- Implement `EvalBackend` in `src/eval/agentwareBackend.ts` (the `eval` method takes an
  `EvalCase` and an `AbortSignal`, returns an `EvalTrace`).
- Be constructed in `src/eval/cli.ts` when `--backend agentware` is passed.
- Import lane types only through the interface seam in `src/eval/types.ts`, not through
  `src/tools/` or `src/governor/` directly.

Until that day, any attempt to use `--backend agentware` must fail with the same stub to
preserve the CI contract.

## pedro-agentware evals (HaikeiLabs/Agentware)

- Python: `python/src/evals/` (`main.py`, `models.py`, `runner.py`, `cases/{calendar,file_search,general,github}.py`),
  run with `PYTHONPATH=python/src python3 -m evals.main`. The root `testing/evals/` contains
  only stale `.pyc` — the live source is `python/src/evals`.
- Go: `go/evals/` + `go/cmd/evals`.
- TypeScript: `typescript/src/evals/` (`index.ts`, `models.ts`, `runner.ts`, `main.ts`,
  `cases/{general,file_search}.ts`), run with `node dist/evals/main.js`.
- Docs: `docs/evals/README.md` and `docs/evals/examples/{ollama_example.py,openai_example.py}`.

## Validation commands

```bash
# assistant eval track (from the feat/headless-agent-evals branch)
node --test test/eval.harness.test.ts
node --experimental-strip-types src/eval/cli.ts --backend scripted --suite eval/fixtures/semantic-model-commands.golden.json

# chat harness
uv run ruff check src/ tests/
uv run pytest tests/test_eval_harness.py tests/test_headless_harness.py -q -m "not integration"

# agentware python evals
# Run from the HaikeiLabs/Agentware repo: cd python && pytest
```

## Realistic usage boundaries

- **Do not** wire `--backend agentware` or invent an agentware runner. The contract is the
  seam: a future backend implements `EvalBackend` in `src/eval/agentwareBackend.ts` and is
  constructed in `cli.ts`. Until then, `agentware` must exit non-zero with the stable stub
  message so CI can assert the harness exists without mocking an agent.
- **Do not** import lane/product code or agentware into `src/eval/types.ts` — the types are
  pure data and the seam is interface-only.
- **Do not** let a scripted case touch the network, filesystem, or a timer; determinism is
  the point. Golden `expect` is populated verbatim from fixture JSON and asserted without
  interpretation.
- **Do not** add free-form error strings to traces or reports; the error contract is closed
  (`backend-threw`, `aborted`, `invalid-case`, `backend-error`, and the pinned stub text).
- Keep golden cardinality pinned: `test/eval.harness.test.ts` asserts the case counts. A
  removed case is a break.

## Related skills

- `kei-tool-adapters` — the tool lanes and closed command parsers that the golden fixtures
  pin.
- `kei-openai-backends` — the model backends that the chat harness and agentware evals
  drive.
- `agentware-sdk` — the middleware that the future `agentware` eval backend would integrate
  with.
