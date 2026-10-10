---
name: kei-tool-adapters
description: The governed tool-lane pattern for a TypeScript ingress service (lane anatomy, closed catalogs and command parsers, governor proposals and the stdio decision protocol, a typed tool registry), plus the tool formats of the Kei chat harness and the pedro-agentware TS SDK. Use when building a tool lane (schema/client/guard/envelope/renderer/runtime), a GovernorClient or governor proposal, a closed query catalog or command parser, a pinned tool registry, or any agent tool adapter / tool binding / tool schema across the Kei repos. Keep the generic middleware/tool-execution guidance in agentware-sdk.
---

# TypeScript tool adapters (Kei)

A tool lane turns a **verified grant** into one bounded downstream call, gates it, and
renders a closed reply. It is deliberately NOT a generic tool-execution layer: there is no
model-chosen tool invocation, no free-form tool loop, and no per-call endpoint selection.
Every lane ships dark until a reviewed activation enables it.

## The lane anatomy (per tool lane)

Each lane is a small stack of six components, composed in the composition root:

1. **Schema** — the closed wire constants (the lane's scope, fixed field names) and
   strict-JSON parsing helpers.
2. **Client** — the ONE downstream call, network-only, behind a minimal fetch-shaped seam
   injected at composition. The method, path and target are fixed constants.
3. **Guard** — the decision gate: role resolver + `GovernorClient` + a decision audit sink +
   a `dispatch` callback. It validates the selection, asks the governor, and refuses on any
   deny (`audit_failed`, `selection_invalid`, role-ineligible, etc.).
4. **Envelope** — strict, fail-closed validation of the execution grant and the captured
   downstream result before anything is rendered.
5. **Renderer** — turns the validated envelope into chat-flavoured markdown. Never returns
   null; a null render is a composition fault that collapses to `unavailable`.
6. **Runtime** — builder helpers from validated boundary objects.

A lane that answers several questions keeps two closed selection components:

- A **fixed query catalog**. A selector may pick a query id; it may NEVER say what a query is.
- A **closed, deterministic command parser** from text to query id: normalize → exact-match a
  phrase table → route, else one fixed help reply. No LLM, no fuzzy match, no scoring, and a
  hard cap on input length.

## Governor proposals and the stdio protocol

- Proposal builders mint **branded** proposals. The closed proposal union admits only
  builder-minted tuples — there is no way to hand `GovernorClient` a caller-authored tuple.
- `GovernorClient` writes one versioned request and reads exactly one versioned decision JSON
  line from stdout on exit 0, over a **construction-pinned runner**. Decisions are bound to
  the exact request (id refs, identity refs, canonical tuple, exact role list, exact version
  pins); a mismatch is a replay → `unavailable`. Stderr is never a decision. Stdout framing
  is exact (bounded size, one LF, no CR, no second line).
- Decision reason codes are a closed set (`policy-allow`, `explicit-deny`, `default-deny`,
  `invalid-*`, `unknown-tool`, `unknown-lane`, `tool-disabled`, `lane-disabled`,
  `role-ineligible`, `constraint-widening`, `identity-mismatch`).

## The typed registry

A versioned tool-lane registry (YAML) pins lanes, tools, permissions (resource/action/scopes),
sensitivity class, audience ceiling, freshness, rate class, pinned endpoint, and an `enabled`
flag. Every lane and tool not explicitly activated is `enabled: false`. Widening any frozen
tuple field (resource, action, scope set, sensitivity, audience ceiling, pinned endpoint)
is `constraint-widening` and denies until a reviewed ADR ratifies it.

The vendored registry, role map and governor script are byte-pinned: a verify script in CI
checks their SHA-256 digests. A registry change is therefore two steps:

1. A reviewed ADR proposes the change (new lane, tool, or permission).
2. The registry files are updated, the digest pins regenerated, and the new pins committed
   with the ADR. CI fails if the pins are stale.

## Related tool surfaces (not the lane pattern)

- **Chat harness** (`HaikeiLabs/Kei-Chat-Harness`): agent tools live in
  `src/pedro_service/agent.py` (`search_wiki`, `list_prs`, `create_issue_tool`, ...) with a
  `Permission`/`ROLE_PERMISSION_MAP` and ABAC via `kei_proxy_client.py`. Tool schemas are
  rendered per model in `src/pedro_service/tool_definitions.py` (`ModelFormat`: OpenAI /
  Anthropic / Ollama). `config/tools.yaml` and `config/roles.yaml` configure role→tool gates;
  `config/kei-proxy-registry.yaml` maps tools to Kei services.
- **pedro-agentware TS SDK** (`HaikeiLabs/Agentware`, package `@haikeilabs/agentware`): `tools/`
  (Tool, Result, ToolRegistry), `toolformat/`, `memory/` (async wiki-memory MCP client,
  `memoryTools()` in Vercel AI SDK zod shape). See `agentware-sdk` for the generic middleware.

## Validation commands

For a lane service: run typecheck, lint, every lane's unit tests, its `*_integration` test,
the deployment-artifact contract test, and the registry digest verify script.

Chat harness (`HaikeiLabs/Kei-Chat-Harness`):

```bash
uv run ruff check src/ tests/
uv run pytest tests/test_headless_harness.py -q   # exercises /tool endpoints with kei proxy disabled
```

## Realistic usage boundaries

- **Do not** add a selection seam where a catalog constant is pinned. "An endpoint a request
  could vary is an endpoint a model could steer."
- **Do not** let a renderer or guard import the downstream token mints; only the composition
  root may. Enforce it with a lint rule and a source-scan test.
- **Do not** accept a decision by shape alone. A schema-shaped reply for another principal,
  request, or tool is a replay and must collapse to `unavailable`.
- **Do not** make `GovernorClient` pick the executable/argv/env/cwd/timeout; those are
  construction-pinned by the composition root only.
- Keep closed things closed: the catalog, the phrase table, the help text, the scope
  allowlists, the interpreter flags, and fixed selections are source constants, not env or
  per-call parameters.
- When adding a tool lane, add the full stack (schema/client/guard/envelope/renderer/runtime
  + proposal + registry entry) plus a matching integration test and the governance assertions
  in the deployment-artifact contract test.

## Related skills

- `kei-ingress-security` — the ingress gates that produce the verified grant.
- `kei-teams-ingress` — the Teams/Bot Framework routing layer that delivers activities.
- `kei-headless-evals` — golden fixtures that pin closed command parsers and selection
  validators.
- `agentware-sdk` — generic middleware for tool-call policy and audit (the chat harness's
  approach, not the governor pattern).
