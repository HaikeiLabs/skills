---
name: agentware-sdk
description: Use the open-source agentware SDK (pedro-agentware) — policy enforcement and audit middleware for agent tool calls, in Go, Python, and TypeScript. Use when working with middleware policy/audit, AuditedToolClient, ToolExecutor, CallerContext, Action ALLOW/DENY/FILTER, rate limits, guardrails (response validator, step enforcer, error tracker, nudge), KEI_HARNESS_TOKEN, OpaqueTokenProvider/JWTTokenProvider, HarnessManifest, KeiProxyEvaluator, kei-proxy, delegation, the third-party harness contract, or the action-tool/connector boundary. This is generic agentware guidance; the tool-adapter/governor lane pattern lives in the assistant's developer skills, and no invented APIs are allowed — the code and docs in the repo are the source of truth.
---

# Open-source agentware (pedro-agentware)

Agentware is an MCP-compatible middleware layer that sits between an LLM
orchestrator and tool execution: it **intercepts every tool call, enforces
policy, records an audit, and redacts args**, then lets the call proceed only
when a decision allows it. It is language-agnostic and ships three ports: Go
(`github.com/soypete/pedro-agentware/go`), Python (package `pedro_agentware`,
src layout), and TypeScript (`@pedro/agentware`). This skill is about the
library and its seams.

## General middleware principles

These principles apply regardless of the specific agentware library or language.
They are extracted from practical middleware design and reinforced by the
pedro-agentware codebase.

### Tool-call boundary

- Validate tool names and arguments against a closed registry before execution.
- Carry authenticated caller and delegation context separately from user text.
- Make authorization an explicit allow, deny, or filtered decision.
- Return bounded, typed results and stable correlation IDs.
- Fail closed on malformed requests, missing identity, policy errors, timeouts,
  and unavailable providers.

### Audit boundary

Record the minimum metadata needed to reconstruct a decision: correlation ID,
caller pseudonym, tool name, policy decision, result status, timestamps, and
safe error category. Do not store bearer tokens, raw credentials, hidden model
reasoning, or unnecessary user content.

### Reasoning and context trees

When a backend exposes reasoning, normalize it into bounded structured events:
goal, observation, decision, tool-call, tool-result, conclusion, or blocker.
Retain summaries and evidence references, not raw chain-of-thought. Preserve
parent/child links and tool-call IDs so an evaluator can explain the path
without exposing private reasoning.

### Testing

Test allowed and denied calls, malformed arguments, missing identity, tool
failures, recovery, ordering, budget exhaustion, and audit redaction. Prefer
deterministic scripted backends for CI and reserve live provider tests for
explicit integration environments.

## Where things live

- `python/` — package `pedro_agentware` (src layout) under `python/src/pedro_agentware/`.
- `go/` — module `github.com/soypete/pedro-agentware/go`.
- `typescript/` — TS SDK `@pedro/agentware` (jest; `zod` + `minimatch`).
- `docs/engineering-design.md` — the language-agnostic design; `docs/middleware-llm-guide.md`
  the harness guide; `docs/harness-contract.md` the third-party harness contract;
  `docs/tenant-proxy-reference.md` the authoritative architecture;
  `docs/action-tool-boundary.md` the enforcement/execution boundary.
- `docs/{python,go,typescript}/README.md` show OLD APIs (`middleware_py`,
  `LangGraphToolWrapper`) that no longer exist — trust the code and tests, not those docs.

## Install and dependencies

All three ports live in the pedro-agentware repo. The facts below are verified
against the repo README, `python/pyproject.toml`, `go/go.mod`, and
`typescript/package.json`.

### Go

- Source: `go/`, module path `github.com/soypete/pedro-agentware/go`.
- Install: `go get github.com/soypete/pedro-agentware/go`. Registry-free — the
  Go module proxy resolves it, so no CodeArtifact login is needed (D-008).
- Runtime dependencies (`go/go.mod`): `github.com/soypete/ontology-go`,
  `gopkg.in/yaml.v3`.

### Python

- Source: `python/`, package `pedro-agentware` (import name `pedro_agentware`,
  src layout under `python/src/pedro_agentware/`).
- Install: from a checkout of the repo, `pip install -e ./python` — the README's
  documented path for local work. The package is not published to public PyPI.
- Runtime dependencies (`python/pyproject.toml`): `pydantic>=2.0`,
  `httpx>=0.27.0`. Requires Python >=3.10. Optional extra `inference` adds
  `pgmpy>=0.1.26`; `dev` adds pytest/ruff/mypy.

### TypeScript

- Source: `typescript/`, package `@pedro/agentware` v0.1.0.
- Install: **not published to npm** — D-008 defers that decision. Consume it
  from the repo, not from a registry: `cd typescript && npm install && npm run
  build` (emits `dist/`), then reference it from your project.
- Runtime dependencies (`typescript/package.json`): `minimatch`, `zod`. No peer
  dependencies. Requires Node >=18.

## The core pattern (same in all three ports)

The pattern is shared; the spelling is not. Go, Python, and TypeScript name and
shape these types differently (for example `Execute` vs `execute`, error
return vs raised exception, sync vs async). The names below are a map, not a
signature reference. Before writing integration code or telling someone
"this type exists", open the port they are using (`go/`, `python/`,
`typescript/`) and confirm the exact type, method, argument order, and
failure behavior there, including in its tests. Say which port you checked. If
you cannot check, say the names are unverified.

1. **Types**: `Action` (`ALLOW` | `DENY` | `FILTER`), `CallerContext` (user/session/role/
   source/trusted + delegation fields `invoking_subject`, `parent_span`, `delegation_depth`),
   `Decision` (action + rule + reason + redacted args), `MessageType`/`MessageMeta`.
   `ToolDefinition` lives in the LLM/request layer, not middleware/types.
2. **Policy engine**: `Policy` = ordered rules; first match wins, else default-deny or
   default-allow. `Condition` operators: `eq`, `not_eq`, `contains`, `not_contains`,
   `matches`, `not_matches`, `exists`, `not_exists` (plus `not`). `RateLimit` per-key
   sliding window.
3. **Auditor**: `AuditRecord`, `AuditFilter`, `InMemoryAuditor`, `NoOpAuditor`; async batched
   logger in Go (`AsyncLogger` with drop counting).
4. **Middleware**: `MiddlewareImpl.execute` (deny → `(None, False, reason)`, filter →
   redacted args), `with_policy`, `with_auditor`, `new_middleware()`.
5. **Tool client**: `AuditedToolClient` — async `Execute(tool_name, args, user_id,
   channel_id, guild_id, func, caller)`; raises `PermissionError` on denial; records to
   the auditor.
6. **Guardrails**: `guardrails/` — `response_validator`, `step_enforcer`, `error_tracker`,
   `nudge`; the inference loop in `middleware/inference.py` (`run_inference()`,
   `RetriesExhaustedError`).

The audit record carries the invoking subject, the delegation chain (`parent_span`,
`delegation_depth`), the originating framework, a SHA-256 digest of the arguments rather
than the arguments themselves, the resources touched, the policy decision and rule,
token counts, latency, and success/error. `resources_touched` makes
"show every agent invocation that read table X on behalf of user Y" answerable.

## KEI identity/auth integration (Python on main)

- `python/src/pedro_agentware/kei/auth.py` — `TokenType` (OPAQUE | JWT),
  `BOOTSTRAP_TOKEN_ENV = "KEI_HARNESS_TOKEN"`, `OpaqueTokenProvider` (current, no auto-renew;
  `invalidate()` fails closed with `httpx.HTTPStatusError`), `JWTTokenProvider` (future
  exchange/refresh/revoke contract, gated behind explicit `enable()`, else fail-closed).
- `python/src/pedro_agentware/kei/config.py` — `HarnessManifest` (schema `1.0.0`,
  `extra="forbid"`), `validate_manifest` rejects any manifest containing the bootstrap secret,
  `load_manifest`, `get_config`.
- `python/src/pedro_agentware/kei/proxy.py` — `discover_proxy`/`run_proxy`/`stop_proxy`;
  the token reaches the `kei-proxy` subprocess **only via env, never argv**.
- Contract tests: `python/tests/kei/` — `fake_kei_server.py` (`FakeKEIServer`,
  `ThreadingHTTPServer` implementing `/auth/exchange`, `/auth/refresh`, `/auth/revoke`,
  `/config`) plus `contract_test.py`, `auth_test.py`, `config_test.py`, `proxy_test.py`.
  Fixture: `fixtures/kei/harness-v1.json`.
- There is **no** Go or TypeScript KEI module on main; KEI work lives in Python only.
  Do not assume parity.

### Runtime environment for the harness and proxy

The harness and `kei-proxy` are co-located in the same container or host
runtime. Put the runtime configuration in the harness service environment so
the proxy subprocess inherits it:

```text
KEI_RUNTIME_CONTROL_PLANE_URL=https://app.haikeilabs.com
KEI_RUNTIME_TOKEN=<secret-manager-value>
KEI_RUNTIME_VERSION=<deployed-version>
```

The control-plane value is the gateway base URL; do not append `/api/v1`. In
Docker or a service manifest,
inject the URL and version as ordinary environment values and inject
`KEI_RUNTIME_TOKEN` from a protected secret or env-file. Never pass the token
as an argv flag, write it to logs, or derive authoritative scope from
`KEI_ORG_ID`; the runtime token establishes the installation and workspace
scope; the org is derived through the workspace.

## Third-party harness contract

`docs/harness-contract.md` defines how a third-party harness is governed by
agentware without depending on an agent framework. A harness provides three
required components:

1. **AuthProvider** — supplies tokens for the KEI API (use `OpaqueTokenProvider`, or
   implement the `get_token`/`invalidate`/`get_token_type` protocol).
2. **ToolExecutor** — executes tools on behalf of agents (implement `execute(tool_name, args)`).
3. **SecretProvider** — sources the bootstrap secret `KEI_HARNESS_TOKEN`
   (use `EnvSecretProvider`).

Assemble with `HarnessContract(auth_provider, tool_executor, secret_provider)` and
validate with `validate_contract`. Optional components have defaults: `policy_evaluator`
(`None` = allow all), `auditor` (`InMemoryAuditor`), `proxy_process` (`None`).
`KeiProxyEvaluator` (`kei/evaluator.py`) is the policy-enforcement seam and **fails
closed on every path that is not an explicit `permit`/`allow`**.

Fail-closed rules: unknown policy decision → DENY; unreachable proxy → DENY; missing
credential → DENY; expired token → DENY.

## The control-plane and action-tool boundary

Authoritative sources: `docs/tenant-proxy-reference.md` and
`docs/action-tool-boundary.md`. Execution happens tenant-side. Kei is a
**metadata-only control plane**; ABAC is a **policy decision point only**.

- `tool_bindings` (tool → connector routing) and `secret_refs` (opaque reference
  identifiers) are **non-secret metadata**. They never grant permissions and are never
  resolved to credentials by the library.
- The **proxy is the enforcement boundary** for governed external operations: it
  resolves bindings and auth, invokes provider adapters, and returns data only inside
  the tenant runtime.
- **Never in Kei**: provider payloads and results, customer content, credentials,
  embeddings, and indexes.
- A local policy loop (`AuditedToolClient` + a local `Policy`) runs fully governed
  with **zero** dependence on Kei/ABAC; the proxy is an optional adapter behind the
  `PolicyEvaluator` interface.
- `invoking_subject` is the human and is carried unchanged across every delegation hop.

## LangGraph and memory

- LangGraph integration is `python/src/pedro_agentware/memory/langgraph.py`
  (`LangGraphMemoryTools`: `memory_ingest`, `memory_write_page`, `memory_query`,
  `memory_get_claims`, `memory_lint`) plus the `middleware/inference.py` loop — there is
  no `middleware/langgraph.py` and no `LangGraphToolWrapper`.
- Wiki memory: Go `go/memory` (ontology-constrained: vault, page parser, ontology validation,
  query, lint; `cmd/memctl` CLI) backed by the `ontologies/` git submodule.

## Validation commands

Run in a checkout of the agentware repo:

```bash
# Python
make python-lint python-typecheck python-test      # ruff check . ; mypy . ; pytest

# Go
make go-build go-test go-lint go-vet              # go build ./... ; go test ./... ; golangci-lint run

# TypeScript
cd typescript && npm run build && npm test        # tsc + jest

# KEI contract suite
cd python && pytest tests/kei/ -v

# Action-tool boundary contract tests
cd python && pytest tests/action_tool_boundary_test.py -v
cd go && go test ./middleware/... -run ActionToolBoundary -v
```

## Realistic usage boundaries

- **Do not** invent an agentware API that is not in the code. The README and
  `docs/{python,go,typescript}/README.md` drift from the source (`middleware_py`,
  `LangGraphToolWrapper` no longer exist); the tests and `python/src/evals` are the ground truth.
- **Do not** run an agent loop inside the middleware. Middleware decides and audits tool
  calls; the harness (`middleware/inference.py`, `evals`, adapters) owns the loop.
- **Do not** grant anything on a manifest. `BINDINGS_GRANT_PERMISSIONS = False` and
  `validate_manifest` fail closed on a bootstrap-secret-bearing manifest.
- **Do not** ship tokens through argv, logs, or audit records. `OpaqueTokenProvider` is
  fail-closed on renew; keep it that way.
- **Do not** resolve connector `secret_refs` or execute providers in the library; that is
  the proxy's job, tenant-side.
- **Do not** expect Go/TypeScript parity with the Python KEI module; there is no Go or
  TypeScript KEI module on main.
- The tool-adapter/governor tool-lane pattern (closed catalogs, branded governor
  proposals, typed registries) is specific to the DVL Assistant's developer skills, not
  part of this generic SDK skill.

## Related skills

- `kei-agents` — agent definitions and governed connector read schemas that the harness
  renders; provider-neutral and schema-only.
- `kei-api` — the control-plane API that mints harness keys and decides
  metadata-only policy.
