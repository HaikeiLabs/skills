---
name: kei-openai-backends
description: OpenAI-compatible LLM backend integration for the Kei chat harness and the pedro-agentware evals. Use when the task mentions LLM_ENDPOINT, LLM_MODEL, OPENAI_BASE_URL, OpenAIChatModel, pydantic-ai, /v1 chat/completions, llama.cpp, vLLM, Ollama, llamafile, the kei local stack (docker-compose.kei-local.yml, scripts/seed-local-kei.sh), abac-engine/oidc-bridge, or wiring any model backend. Use for the harness's model-format tool renderers (OpenAI/Anthropic/Ollama in tool_definitions.py) and the evals ModelBackend. A zero-LLM ingress service deliberately has NO LLM — do not reach for this skill inside one.
---

# OpenAI-compatible backends

The chat harness and the eval harnesses talk to **any OpenAI-compatible `/v1` endpoint**
(llama.cpp, vLLM, Ollama-compatible, etc.). There is no hardcoded provider and no `openai`
SDK dependency: the harness uses pydantic-ai's `OpenAIChatModel` and the eval harnesses use a
raw `/chat/completions` POST.

### Supported model families

Agentware supports **five model families** (OpenAI, Anthropic, Qwen, DeepSeek, GLM)
across its three ports (Go, Python, TypeScript). Each family has a dedicated `ToolFormatter`
that handles tool-definition rendering, tool-call parsing, tool-result formatting, and
reasoning-field extraction. The canonical reference is Agentware's
`docs/model-format-reference.md` (PR #166, commit `8966e82a`); the tables below
summarise it.

Models not in these five families (Llama, Mistral, Nemotron, etc.) fall through to
`GenericFormatter`, which produces the same OpenAI-compatible JSON function-calling
format as `OpenAIFOrmatter`.

#### Tool-definition schemas

| Family | Definitions format | Tool calls (response) | Tool result shape |
|---|---|---|---|
| **OpenAI** | JSON: `{type: "function", function: {name, description, parameters}}` | `tool_calls` array: `{id, type: "function", function: {name, arguments (JSON string)}}` | `tool_call_id`, `role: "tool"`, `content` |
| **Anthropic** | JSON: `{type: "function", function: {name, description, parameters}}` | `content` array with `type: "tool_use"` blocks: `{id, name, input (parsed dict)}` | `content` array with `type: "tool_result"` blocks: `{tool_use_id, content}` |
| **Qwen** | XML: `<tool_description><tool_name>name</tool_name><parameters>...</parameters></tool_description>` | `tool_calls` array (OpenAI-compatible); or XML: `<tool_call><tool name="name">JSON args</tool></tool_call>` | `tool_call_id`, `role: "tool"`, `content` |
| **DeepSeek** | JSON: `{type: "function", function: {name, description, parameters}}` | `tool_calls` array with OpenAI-compatible shape; `reasoning_content` parallel to `content` | `tool_call_id`, `role: "tool"`, `content` |
| **GLM** | JSON: `{type: "function", function: {name, description, parameters}}` (dedicated GLM schema path) | `tool_calls` array (OpenAI-compatible shape); arguments as JSON object (not string) | `tool_call_id`, `role: "tool"`, `content` |

OpenAI, DeepSeek, and GLM all use the same JSON function-calling format for
definitions, calls, and results; they differ only in reasoning fields and
thinking tags.

#### Reasoning and thinking fields

| Family | Reasoning field | Inline thinking tags | Notes |
|---|---|---|---|
| **OpenAI** | `reasoning_content` (top-level on choice message) | None | o-series models; field is in the known set, no registration needed |
| **Anthropic** | `thinking` (content block `type: "thinking"` in Messages API) | None | Extended thinking is a structured content block with signature; adapter also recognises `thinking_content` |
| **Qwen** | `reasoning_content` (top-level) | `<thinking>...</thinking>` in content text; QwQ-32B uses `type: "reasoning"` content blocks | Both field and tags are handled generically |
| **DeepSeek** | `reasoning_content` (native field) | `[THINK]...[/THINK]` in text mode | Unbalanced `[THINK]` is a fail-closed error; guardrails response validator strips as secondary rescue |
| **GLM** | `reasoning_content` (native field) | None | Same field format as OpenAI; no inline tags |

The adapter's known field set (priority order): `reasoning_content`, `thinking`,
`thinking_content`, `reasoning`. Arbitrary additional field names can be
registered per model via `RegisterModelField` / `register_model_field`.

#### Tool-call argument format

OpenAI and DeepSeek encode arguments as a JSON **string** in the response
(`"arguments": "{\\"location\\": \\"Tokyo\\"}"`). Anthropic uses a **parsed
dict** for the `input` field of `tool_use` blocks. GLM is the exception:
arguments arrive as a parsed JSON object. Qwen follows the OpenAI-compatible
format (JSON string) or embeds JSON args in XML attributes.

#### Format selector

The harness selects the formatter by model name (prefix matching,
case-insensitive). The `ModelFormat` enum drives `render_tools()` at
construction time (one per agent lifetime); the `FormatAdapter` class
selects the renderer by format name:

| Model tag | Formatter struct | Notes |
|---|---|---|
| `gpt-*`, `o1-*`, `o3-*` | `OpenAIFOrmatter` | `reasoning` field (o-series); also `reasoning_content` |
| `claude-*`, `anthropic-*` | `AnthropicFormatter` | `thinking` content block |
| `qwen-*`, `qwq-*` | `QwenFormatter` | QwQ prefix triggers `type: "reasoning"` content block handling |
| `deepseek-*` | `DeepSeekFormatter` | `reasoning_content` + `[THINK]` tags |
| `glm-*`, `chatglm-*` | `GLMFormatter` | Arguments as JSON object |
| `llama-*`, `ollama-*`, `llamafile-*` | `GenericFormatter` | Same JSON format as OpenAI |
| Everything else | `GenericFormatter` | Fallback |

Adding a new family means adding a `ModelFormat` enum variant, a dedicated
formatter struct, a selector entry, and reasoning-adapter model-field
registration if the model uses a non-standard reasoning field name.

#### Reasoning adapter

The adapter (`go/reasoning/adapter.go`, `reasoning.py`, `reasoning.ts`) is
model-agnostic and handles all five families through the same code path.
It normalises reasoning fields into a canonical `Reasoning` object, applied
to every streaming delta / final choice:

| Variant | Input field | Behavior |
|---|---|---|
| **OpenAI** | `choice.delta.reasoning_content` | No tag stripping needed |
| **Anthropic** | `delta.delta.thinking` (content block) | Also recognises `thinking_content` for alternative SDK naming |
| **Qwen** | `choice.delta.reasoning_content` | Strips `<thinking>...</thinking>` from content text |
| **DeepSeek** | `choice.delta.reasoning_content` | Strips `[THINK]...[/THINK]` from text-mode output; unbalanced `[THINK]` returns `ErrUnbalancedThinking` |
| **GLM** | `choice.delta.reasoning` | Similar to OpenAI; no tag stripping needed |

All formatters share the `ToolFormatter` interface (5 methods:
`FormatToolDefinitions`, `ParseToolCalls`, `FormatToolResult`, `ModelFamily`,
`ValidateFormat`). Implementation files in Agentware at
`go/toolformat/{family}.go`, `python/.../toolformat/formatter.py`,
`typescript/src/toolformat/formatter.ts`. Shared fixtures at
`fixtures/toolformat/{family}-cases.json` and `fixtures/reasoning/{family}-cases.json`.

> **Validation reference.** Every claim above is confirmed by the Go/Python/TypeScript
> fixtures in Agentware PR #166 (`docs/model-format-reference.md`,
> `fixtures/toolformat/`, `fixtures/reasoning/`).
> Do not add model families that are not listed here; they are not supported
> by Agentware's formatters.

### Chat agent capabilities

The pydantic-ai agent created by `create_agent()` ships these capabilities, all from
`pydantic-ai-harness`:

- `CodeMode()` — runs Python code in a subprocess sandbox
- `FileSystem()` — read/write files within an allowed root
- `Shell(denied_commands=[...])` — shell command execution with a deny list
- `WebSearch(native=False, local="duckduckgo")` — web search via DuckDuckGo
- `Thinking(effort="medium")` — chain-of-thought reasoning with configurable effort

These are registered as tools on the model at construction time and are available to every
chat turn. The harness does not support dynamic tool registration — tools are fixed at
agent construction and recreated on every `POST /message`.

## Chat harness (HaikeiLabs/Kei-Chat-Harness)

- `src/pedro_service/config.py` — `LLM_ENDPOINT` and `LLM_MODEL` must BOTH be non-empty for
  real mode; otherwise `FakePedroAgent` (deterministic fake) is used. The code default
  endpoint is an internal host, so always set `LLM_ENDPOINT` explicitly; default model
  `qwen3.6-27b-mtp`.
- `src/pedro_service/agent.py` `create_agent()`:
  ```python
  os.environ["OPENAI_API_KEY"] = config.openai_key or "any-key-works"
  os.environ["OPENAI_BASE_URL"] = f"{config.llm_endpoint}/v1"
  model = OpenAIChatModel(config.llm_model, provider="openai")
  ```
  The API key VALUE is deliberately ignored by most compatible endpoints — only non-emptiness
  matters. Capabilities: `CodeMode()`, `FileSystem()`, `Shell(denied_commands=[...])`,
  `WebSearch(native=False, local="duckduckgo")`, `Thinking(effort="medium")` from
  `pydantic-ai-harness`.
- Tool schemas are model-format aware: `src/pedro_service/tool_definitions.py` renders
  `TOOL_DEFINITIONS` per `ModelFormat` (OpenAI / Anthropic / Ollama) via `render_tools()`.
- Eval client: `testing/evals/models.py` POSTs `{base_url}/chat/completions` directly.

### Discord main integration

The harness also provides a Discord adapter (`src/pedro_service/discord_main.py`) that
uses the same `create_agent()` and the same model configuration. The Discord path uses
`discord.py` for gateway events and reuses the same `OpenAIChatModel` / tool-definition /
KEI-proxy stack. `LLM_ENDPOINT` and `LLM_MODEL` apply identically. This is the default
local-development path as it does not require Azure Bot registration.

### Kei local stack

For local development and contract testing the harness can run against a local Kei stack:

- `docker-compose.kei-local.yml` — postgres, `abac-engine` (port 8080), `oidc-bridge`
  (8081), `credential-admin` (8090), `web`. Built from the sibling `kei` repo
  (`../kei/cmd/...`), so that checkout must exist.
- `scripts/seed-local-kei.sh` + `scripts/seed-local-kei.sql` — seeds org/user/group/policy/
  harness-key fixtures (defaults `LOCAL_KEI_ORG_ID`, `LOCAL_KEI_USER_UUID`, `KEI_RUNTIME_TOKEN=local-dev-token`).
- `docker-compose.local.yml` — the harness's own local compose (LLM + service).

### Env vars that matter

`LLM_ENDPOINT`, `LLM_MODEL`, `OPENAI_API_KEY`/`OPENAI_KEY`, `KEI_RUNTIME_TOKEN`,
`KEI_API_URL` (fallback `ABAC_URL`), `KEI_PROXY_PATH`, `KEI_PROXY_DISABLED` (inverted into
`kei_proxy_enabled`; `true` short-circuits authorization to permit), `INTERNAL_API_KEY`
(guards the `/message` endpoint). See `config.py` `Config.from_env()` for the full set.

### Eval ModelBackend variants

The chat harness `eval_harness.py` supports these backends:

| `ModelBackend` | Endpoint shape | Typical use |
|---|---|---|
| `openai` | OpenAI API (real provider key) | Production-like eval against OpenAI |
| `anthropic` | Anthropic-compatible (via `base_url` override) | Cross-provider comparison |
| `ollama` | Ollama `/v1/chat/completions` | Local, air-gapped, or cost-free |
| `llamafile` | Llama.cpp `/v1/chat/completions` | Single-binary local inference |
| `vllm` | vLLM `/v1/chat/completions` | GPU-accelerated production eval |
| `ollama_direct` | Ollama native API (non-OpenAI) | Direct Ollama integration without `/v1` wrapper |

Each backend sends the same `TestCase` shape (`messages`, `tools`, `tool_choice`) but may
normalize it differently. The `EvalHarness` class selects the backend by name, constructs
the appropriate client, and writes JSONL results under `./eval_results/`.

## pedro-agentware evals (HaikeiLabs/Agentware)

- Python: `python/src/evals/models.py` — model backends incl. Ollama; examples at
  `docs/evals/examples/{ollama_example.py,openai_example.py}`.
- TypeScript: `typescript/src/evals/models.ts`; Go: `go/evals`.
- These choose the backend at CLI time; they do not ship a model or a runner.

## Validation commands

```bash
# chat harness, headless (no LLM, no proxy)
# from the HaikeiLabs/Kei-Chat-Harness repo:
KEI_PROXY_DISABLED=true uv run pytest tests/test_headless_harness.py -q
make test-headless

# chat harness with a real local OpenAI-compatible endpoint
uv run python -m pedro_service.discord_main    # needs LLM_ENDPOINT + LLM_MODEL set

# model-format renderers + eval harness
uv run pytest tests/test_tool_definitions.py tests/test_eval_harness.py -q

# kei local stack
docker compose -f docker-compose.kei-local.yml up -d
./scripts/seed-local-kei.sh

# agentware python evals against ollama
# from HaikeiLabs/Agentware: PYTHONPATH=python/src python3 -m evals.main --models ollama
```

## Providers that are not OpenAI-compatible

The supported answer is to put the provider behind an OpenAI-compatible
`/v1/chat/completions` endpoint and point `LLM_ENDPOINT` at that. Many GPU
serving stacks already expose one (vLLM, llama.cpp/llamafile, Ollama's `/v1`).
Otherwise, use a translating gateway the team runs and owns. The harness,
`tool_definitions.py`, and `eval_harness.py` then need no vendor-specific code.

Adding a native, non-OpenAI adapter (a new `ModelFormat`, `ModelBackend`, or
model class) changes the project boundary. That needs a reviewed design (an
ADR or design doc approved by the harness owners) before any code. Until one
exists, do not write or outline implementation steps for it. Explain the
boundary, offer the compatible-endpoint path, and suggest opening the design
discussion. `ollama_direct` is an existing exception, not a template
for new ones.

## Realistic usage boundaries

- When describing how to add a new model family, reference `ModelFormat` and `ToolFormatter` by name; for cross-port support point to `model-format-reference.md` as the canonical spec.
- When a model family is already handled by `GenericFormatter` (e.g. Mistral), still point to `model-format-reference.md` for the full format contract.
- When describing DeepSeek's `[THINK]` tags, state that unbalanced tags are a fail-closed error.
- When comparing how families handle extended thinking, mention that Anthropic uses `thinking` as a structured content block, has no inline tags, and the adapter also recognises `thinking_content` as an alternative field name.
- **Do not** add a hardcoded model vendor, a proprietary SDK, or a non-OpenAI-compatible
  endpoint assumption. The `/v1` + `chat/completions` contract is the boundary.
- **Do not** treat `OPENAI_API_KEY` as a real credential for compatible endpoints; it is
  presence-gated. Do not log it, mint it, or send it to hosts you do not trust.
- **Do not** run the model-backed suites as the default CI gate — they are flaky by nature
  and are marked `integration` (each PR-review eval case runs 5x for reliability).
- **Do not** confuse the harness's LLM path with a zero-LLM ingress service (see
  `kei-ingress-security`): a model must never run inside that service.
- `KEI_PROXY_DISABLED=true` is a local/harness escape hatch only. It permits everything; it
  must never be set in a deployed, real-data environment.

## Related skills

- `kei-headless-evals` — the eval harnesses that use these backends.
- `kei-teams-ingress` — the Teams integration that the chat harness provides alongside its
  LLM path.
- `agentware-sdk` — the middleware and KEI auth/proxy modules the harness integrates with.
