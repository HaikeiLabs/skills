# Build with Agentware end to end: details

This is the depth behind the **Build an agent end to end** section of
`SKILL.md`. Each step names the source file and line in the Agentware repo,
so check it against the port you use. The source and tests win over this
file.

## 1. Declare the tools

- **`ToolSpec`** (Python `toolspec/__init__.py:36-48`): `name`,
  `description`, `parameters` (JSON Schema), `service`, `source`,
  `operation_class` (`read` or `write`), `route`, `required_capabilities`,
  `resource_types`, `enabled`.
- A tool the harness runs itself uses a `harness_executor` route. A connector
  tool uses a `connector_binding` route with `required_capabilities`:

  ```python
  ToolSpec(
      name="notes.search", description="Search the user's notes",
      parameters={"type": "object", "properties": {"q": {"type": "string"}}, "required": ["q"]},
      service="notes", source="notes", operation_class="read",
      route={"harness_executor": {"executor": "my-harness", "registration": "notes.search"}},
  )
  ```

- **The manifest is `kei.tool-manifest/v3`, and it is the only format the
  exporter writes.** `export_kei_tool_manifest(version=3)` raises an error for
  any other version (Python `tools/registry.py:49-79`). The wire example is
  `fixtures/kei/tool-manifest.v3.json`, and the format is described in
  `docs/tool-manifest-v3.md`.
- **Registration is not a grant.** Register before serving, either with
  `register_tool_specs(client, specs)` over the socket (Python argument
  order, `toolspec/__init__.py:303`; TypeScript is
  `registerToolSpecs(specs, client)`) or with `sync_tool_manifest`. Policy
  decides access separately (step 4).

## 2. Wire the model

- **Python:** `OpenAIBackend(model, base_url, api_key, *, client=None,
  context_window=0)` (`llm/openai_backend.py:55-75`). `complete(messages,
  tools=None)` POSTs `<base_url>/chat/completions`.
- **TypeScript:** `new OpenAIBackend({ model, baseUrl, apiKey, temperature,
  maxTokens, ... })` (`llm/openai_backend.ts:36-46`). It implements
  `AsyncBackend`, which `AgentLoop` takes as `config.backend`
  (`executor/agent_loop.ts:35-47`).
- **Go:** `llm.NewServerBackend(llm.ServerConfig{BaseURL, APIKey, Model,
  ...})` (`go/llm/server.go:14-37`). It sends `Tools`, `Temperature` and
  `Thinking` from the request.
- **Take the model from a Kei model profile, not from code.** Resolve the
  agent's profile at run time through kei-proxy and pass `endpoint` and
  `model` to the backend. The socket client's `model_config()` returns
  them, but **strips the key** (Python `kei/runtime_socket.py:382-392,
  723`). How a profile is chosen, the run-time routes, profile changes and
  failures are covered in the **kei-model-profiles** skill. The full recipe
  is in **build-agents-agentware**.
- **No Agentware backend runs over the socket.** No `Backend` / `AsyncBackend`
  / `llm.Backend` implementation wraps the socket client in any port. The
  socket client's `chat_completion` / `stream_chat_completion` POST
  `/v1/chat/completions`, a route `kei-proxy serve` does not serve. Don't
  build on them, and don't invent an adapter.

### Python limitations today

- `run_inference` builds a tool list but calls `client.complete(messages)`
  with **no tools** (`middleware/inference.py:113-129`). To give the model
  tools in Python, call `OpenAIBackend.complete(messages, tools)` from your
  own loop.
- `OpenAIBackend` sends **no sampling parameters**: no temperature, seed or
  thinking switch (`llm/openai_backend.py:91`). A harness that needs them
  builds its own request. The eval profiles set sampling only for the eval
  runner (`python/src/evals/profiles.py`).
- Only `reasoning_content` is read into `Response.reasoning`
  (`openai_backend.py:111-113`).

## 3. Parse tool calls and reasoning

- **Tool calls:** Python `parse_tool_calls(raw)` (`llm/openai_backend.py:15-37`)
  reads `function.arguments` as a JSON string **or** an object. Unparseable
  or non-object arguments become `{}`, so validate them against the tool's
  schema before you run the tool. The TypeScript equivalent is
  `parseToolArguments` (`llm/openai_backend.ts:87`), and Go uses
  `fromWireToolCalls` (`go/llm/wire.go:93`).
- **Per-family formats** (GLM, Qwen, DeepSeek, Anthropic, ...):
  `get_formatter(model_name)` / `getFormatter` / `toolformat.GetFormatter`
  return a `ToolFormatter`. Which family sends what is in
  `docs/model-format-reference.md` and the **kei-openai-backends** skill.
- **Reasoning:** `ReasoningAdapter()` (Python `reasoning/adapter.py:122`):
  - `.extract(raw, model, backend)` returns a `ContextTree` of bounded
    summaries.
  - `.strip(raw)` returns the answer text without reasoning.
  - `.parse(raw, model, backend)` returns both.
  - `.register_model_field(model, field)` adds a family-specific field.

  `KNOWN_REASONING_FIELDS` is `reasoning_content`, `thinking`,
  `thinking_content` and `reasoning` (:71). Malformed or oversized input
  raises a `ReasoningError` subclass, so fail closed on it. Store a
  reasoning length or digest, never the reasoning text.

## 4. Policy for your tools

- **Wrap the authorization client:** `KeiProxyEvaluator(select_authorization_client(source))`,
  then `AuditedToolClient(..., evaluator=...)` or `.with_policy()` (see
  SKILL.md). Python `AuditedToolClient` **allows** calls when no evaluator is
  set, so always set one.
- **Write the rule** (admin, kei CLI; check `kei policy create -h`):

  ```sh
  kei policy create --workspace WS --group GROUP --allow tool:notes.search
  kei policy test tool:notes.search --workspace WS --as group:GROUP
  ```

  - A `tool:<name>` target is an exact tool name.
  - Sources are groups or `autogroup:member` / `autogroup:admin`.
  - Deny wins, and an unmatched tool is denied.
  - Policy syntax and testing are covered in **kei-harness-policy**.
- **Register the v3 manifest from the harness**, either with
  `register_tool_specs` over the socket or with `sync_tool_manifest` /
  `sync_manifest_path` (Python `kei/tool_sync.py:141, 248`; media type
  `application/vnd.kei.tool-manifest.v3+json`, :63). `kei` has no `tools
  import` command. `kei harness sync --manifest` rejects the v3 export,
  because it reads `route` as a string (kei-cli
  `internal/app/harness.go:461-463, 548`).
- **First live run:**
  1. `kei bot init --platform cli --name NAME`
  2. `kei bot credential` into a 0600 file or a secret manager
  3. `kei harness add --kind custom --installation ID`
  4. Register the tools.
  5. Start `kei-proxy serve`.
  6. Set `KEI_RUNTIME_SOCKET_PATH` for the harness.

  See **kei-runtime-setup** and **kei-cli** for each command.
- **Identity:** each socket session is `KeiProxySocketIdentity(source,
  external_id)` (Python `kei/runtime_socket.py:109`). Which `source` a
  single-owner CLI or voice harness should send, and what an enrollment deny
  looks like there, is **not documented** (see Known gaps).
- **Write tools:** an allowed *proposal* is not an execution. Confirm out of
  band, then authorize again when the tool actually runs.

## 5. Evaluate tool calls

- Write a suite in `agentware.eval-suite.v1` format and run it with the
  Python runner:

  ```sh
  PYTHONPATH=src python3 -m evals.main --suite ../evals/suites \
    --model-profile glm-5.3-flash --out ../evals-out/run --repeats 3
  ```

  See `docs/evals/README.md`.
- The `expect` fields are the tool, `args`, `required_arg_keys`,
  `forbidden_arg_keys` (keep identity out of arguments) and
  `forbidden_tools` (injection).
- Deny cases need `allowed_tools`. The runner then builds a real
  default-deny Kei policy.
- Aim for 90% locally. The Agentware CI gate fails a suite below 95%. Exit
  code 2 means the run did not execute; it is never scored.
- Writing cases, profiles and the CI gate are covered in **test-agents**. The
  older headless harnesses are covered in **kei-headless-evals**.

## What the SDK does not do

- **No rate limiter in Python.** `rate limit` appears only in the error
  tracker and policy-bundle code. Enforce limits in the harness.
- **`jobs`** tracks job status in memory (`jobs/manager.py`). Durable
  scheduling belongs to the harness.

## Known gaps

- The socket chat methods target a route `kei-proxy serve` does not serve.
- No loop backend runs over kei-proxy, and no SDK path keeps the provider key
  inside kei-proxy.
- Python `run_inference` sends no tools, and `OpenAIBackend` sends no
  sampling parameters.
- The `source` value for a single-owner CLI or voice harness is not
  documented.
- `kei harness sync --manifest` can't load the v3 manifest the SDK exports,
  so there is no operator path for it today.
