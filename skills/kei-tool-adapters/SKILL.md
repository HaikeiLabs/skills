---
name: kei-tool-adapters
description: TypeScript tool adapters and the governor tool-lane pattern in the DVL Assistant, plus the tool formats of the Kei chat harness and the pedro-agentware TS SDK. Use when working on src/tools/*, src/governor/*, the project-hours or semantic-model lanes, tool-lane-registry.v1.yaml, GovernorClient or governor proposals, catalog queries, semantic-model-query, my-project-hours, or any agent tool adapter / tool binding / tool schema across the Kei repos. Keep the generic middleware/tool-execution guidance in agentware-sdk.
---

# TypeScript tool adapters (Kei)

An adapter in the assistant turns a **verified grant** into one bounded downstream call,
gates it, and renders a closed reply. It is deliberately NOT a generic tool-execution layer:
there is no model-chosen tool invocation, no free-form tool loop, and no per-call endpoint
selection. Every lane ships dark until a reviewed activation enables it.

## The lane anatomy (per tool lane)

Each lane is a small stack under `src/tools/`, composed in `src/server.ts`:

1. **Schema** (`*Schema.ts`) — the closed wire constants (e.g. `PROJECT_HOURS_SCOPE`,
   `SEMANTIC_MODEL_SCOPE`) and strict-JSON parsing helpers.
2. **Client** (`*Client.ts`) — the ONE downstream call, network-only, minimal fetch-shaped
   seam injected at composition. `ProjectHoursClient`: fixed `GET /assistant/v1/me/project-hours`.
   `SemanticModelClient`: fixed Power BI `ExecuteQueries` POST against the ONE pinned dataset.
3. **Guard** (`*Guard.ts`) — the decision gate: role resolver + `GovernorClient` + a decision
   audit sink + a `dispatch` callback. It validates the selection, asks the governor, and
   refuses on any deny (`audit_failed`, `selection_invalid`, role-ineligible, etc.).
4. **Envelope** (`*Envelope.ts`) — strict, fail-closed validation of the execution grant and
   the captured downstream result before anything is rendered.
5. **Renderer** (`*Renderer.ts`) — turns the validated envelope into Teams-flavoured markdown.
   Never returns null; a null render is a composition fault that collapses to `unavailable`.
6. **Runtime** (`*Runtime.ts`) — builder helpers from validated boundary objects.

For the semantic-model lane there are two closed selection components you must keep closed:

- `src/tools/semanticModelCatalog.ts` — the fixed query catalog (e.g. `my-commission-summary`).
  A selector may pick an id; it may NEVER say what a query is.
- `src/tools/semanticModelCommands.ts` — the closed, deterministic text→query-id parser
  (normalize → exact-match a phrase table → route, else the one fixed help reply). No LLM,
  no fuzzy match, no scoring. `MAX_COMMAND_TEXT_LENGTH = 512` bounds input.

## Governor proposals and the stdio protocol

- `src/governor/proposal.ts` (project-hours) and `src/governor/semanticModelProposal.ts`
  mint **branded** proposals. The closed union `GovernorProposalV1` admits only builder-minted
  tuples — there is no way to hand `GovernorClient` a caller-authored tuple.
- `src/governor/client.ts` speaks `dvl.governor-cli-request.v1` → one `dvl.governor-decision.v1`
  line on exit 0, over a **construction-pinned runner** (`src/governor/subprocessRunner.ts`).
  Decisions are bound to the exact request (id refs, identity refs, canonical tuple, exact
  role list, exact version pins); a mismatch is a replay → `unavailable`. Stderr is never a
  decision. Stdout framing is exact (≤16 KiB, one LF, no CR, no second line).
- The proposal→decision reason codes are a closed set in `src/governor/client.ts`
  (`policy-allow`, `explicit-deny`, `default-deny`, `invalid-*`, `unknown-tool`,
  `unknown-lane`, `tool-disabled`, `lane-disabled`, `role-ineligible`,
  `constraint-widening`, `identity-mismatch`).

## The typed registry

`deployment/governor/registry/tool-lane-registry.v1.yaml` is the canonical registry
(`dvl.tool-registry.v1`). It pins lanes, tools, permissions (resource/action/scopes),
sensitivity class, audience ceiling, freshness, rate class, pinned endpoint, and an
`enabled` flag. Activation is a reviewed ADR + registry diff that re-generates the digest
chain (`scripts/verify-governor-artifacts.mjs` byte-pins the vendored set). The current
shipping base activates exactly `assistant-lane` + `semantic-model-query`; `my-project-hours`
and every other lane/tool stay dark. Widening any frozen tuple field is `constraint-widening`
and denies.

### The registry deployment artifact contract

The vendored registry (`deployment/governor/registry/`) is byte-pinned by
`scripts/verify-governor-artifacts.mjs`. That script asserts that the shipping
set of files (registry YAML, role map, governor script) have not drifted from
their pinned SHA256 digests. A registry change is therefore a two-step process:

1. A reviewed ADR proposes the change (new lane, tool, or permission).
2. The registry files are updated, the digest script re-run, and the new pins
   committed alongside the ADR. CI asserts the pins are up to date.

The current shipping set (assistant-lane + semantic-model-query) is the baseline;
all other lanes and tools are `enabled: false`. Widening any frozen tuple field
(resource, action, scope set, sensitivity, audience ceiling, pinned endpoint)
triggers `constraint-widening` and denies until an ADR ratifies the widening.

## Related tool surfaces (not the assistant lane pattern)

- **Chat harness** (`HaikeiLabs/Kei-Chat-Harness`): agent tools live in
  `src/pedro_service/agent.py` (`search_wiki`, `list_prs`, `create_issue_tool`, ...) with a
  `Permission`/`ROLE_PERMISSION_MAP` and ABAC via `kei_proxy_client.py`. Tool schemas are
  rendered per model in `src/pedro_service/tool_definitions.py` (`ModelFormat`: OpenAI /
  Anthropic / Ollama). `config/tools.yaml` and `config/roles.yaml` configure role→tool gates;
  `config/kei-proxy-registry.yaml` maps tools to Kei services.
- **pedro-agentware TS SDK** (`HaikeiLabs/Agentware`, package `@pedro/agentware`): `tools/`
  (Tool, Result, ToolRegistry), `toolformat/`, `memory/` (async wiki-memory MCP client,
  `memoryTools()` in Vercel AI SDK zod shape). See `agentware-sdk` for the generic middleware.

## Validation commands

Assistant (DVL-Group/assistant):

```bash
npm run typecheck
npm run lint
node --test test/governor_project_hours.test.ts test/governor_subprocess_runner.test.ts \
  test/semantic_model_commands.test.ts test/semantic_model_catalog.test.ts \
  test/semantic_model_guard.test.ts test/semantic_model_governor.test.ts \
  test/project_hours_guard.test.ts test/project_hours_envelope.test.ts \
  test/project_hours_renderer.test.ts test/project_hours_integration.test.ts \
  test/semantic_model_integration.test.ts
node scripts/verify-governor-artifacts.mjs   # byte-pins the vendored registry/role-map/governor
```

Chat harness (`HaikeiLabs/Kei-Chat-Harness`):

```bash
uv run ruff check src/ tests/
uv run pytest tests/test_headless_harness.py -q   # exercises /tool endpoints with kei proxy disabled
```

## Realistic usage boundaries

- **Do not** add a selection seam where a catalog constant is pinned. "An endpoint a request
  could vary is an endpoint a model could steer."
- **Do not** let a renderer or guard import `src/auth/downstream.ts`; only `src/server.ts`
  (the composition root) may. This is enforced by eslint and the source scan.
- **Do not** accept a decision by shape alone. A schema-shaped reply for another principal,
  request, or tool is a replay and must collapse to `unavailable`.
- **Do not** make `GovernorClient` pick the executable/argv/env/cwd/timeout; those are
  construction-pinned by the composition root only.
- Keep closed things closed: the catalog, the phrase table, the help text, the scope
  allowlists, the `-I -B` interpreter args, and the fixed `FIXED_SELECTION` are source
  constants, not env or per-call parameters.
- When adding a tool lane, add the full stack (schema/client/guard/envelope/renderer/runtime
  + proposal + registry entry) plus the matching `*_integration.test.ts` and the governance
  test assertions in `test/deployment_artifact_contract.test.ts`.

## Related skills

- `kei-assistant-security` — the ingress gates that produce the verified grant.
- `kei-teams-ingress` — the Teams/Bot Framework routing layer that delivers activities.
- `kei-headless-evals` — the golden fixtures that pin the closed command parsers and
  selection validators those tool lanes depend on.
- `agentware-sdk` — generic middleware for tool-call policy and audit (the chat harness's
  approach, not the assistant's governor pattern).
