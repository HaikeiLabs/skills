---
name: kei-pi-setup
description: "Install and configure Kei's Pi adapter (`kei-lime-pi`), connect Pi to the local `kei-proxy` Unix socket, understand the supported Pi tools, and verify fail-closed behavior. Use when setting up or updating Pi for Kei, installing the Pi package, checking whether Pi calls use the daemon, or adding supported Pi tools. For generic Claude Code/Codex/OpenCode setup use `kei-harness-setup`; for creating or bootstrapping the runtime use `kei-runtime-setup`."
---

# Set up Pi with Kei

Pi uses the `HaikeiLabs/kei-lime-pi` extension package to connect to the
same-host `kei-proxy` runtime. Pi has no policy engine and never receives the
runtime credential. Use the package source and its README as the implementation
contract; do not infer support from a policy or tool row alone.

## Separate the two Pi packages

- `HaikeiLabs/skills` installs the agent instructions. It does not install the
  Pi adapter or grant access.
- `HaikeiLabs/kei-lime-pi` installs the Pi extension. It does not create a
  runtime installation, connector binding, tool plan, or permission.

Install both from GitHub with Pi's package manager:

```sh
pi install git:github.com/HaikeiLabs/skills
pi install git:github.com/HaikeiLabs/kei-lime-pi
pi list
```

Use `pi install -l ...` to store either package in the current project's
`.pi/settings.json` instead of user settings. For a temporary test without
changing settings, use `pi -e git:github.com/HaikeiLabs/kei-lime-pi`. Pi loads
package extensions on startup; restart Pi or use `/reload` after installation.
The adapter is a trusted extension with full Pi-user permissions. Review its
source before installing it. Do not install from npm; the supported package
source is the GitHub repository.

## Runtime prerequisite

Set up the customer-owned runtime on the same machine as Pi using the
`kei-runtime-setup` and `kei-cli` skills. The installed `kei-proxy` must support
the tokenless owner-session Unix-socket path and v2 connector invocation
(`kei-proxy` 0.2.1 or later). Check the daemon and bundle with:

```sh
kei runtime bootstrap
kei-proxy policy show
```

The extension uses `KEI_RUNTIME_SOCKET_PATH` when set; otherwise it uses the
proxy's platform default (`$TMPDIR/kei-proxy/runtime.sock` on macOS,
`/run/kei-proxy/runtime.sock` on Linux). Keep `KEI_RUNTIME_TOKEN` in the
runtime's protected configuration/secret store. **Do not put it in Pi's
settings, environment, prompt, or project files.** Pi calls only the owner-only
Unix socket; the daemon holds the credential and binds supported calls to the
installation-owner session. The socket is a same-OS-user boundary, not a
process-specific one.

## What the adapter governs

### Local filesystem tools

Pi `read`, `write`, and `edit` calls are intercepted before execution and
mapped to `pi.read`, `pi.write`, and `pi.edit`. The request includes the
canonical absolute path, an argument digest, framework, and span metadata; it
does not send file contents or raw arguments. Only an explicit permit lets Pi
execute the original local tool. Policies for these local file operations are
separate from connector authorization. The active bundle must include the matching
`pi.read`, `pi.write`, or `pi.edit` tool registration and policy; a missing
registration or policy denies the call. A connector permit does not grant
local file access.

### Connector tools

The extension registers one Pi tool, `kei_connector`. It accepts the exact
registered v2 `tool_name` plus that tool's `arguments` and `context`, then:

1. sends the complete operation for `POST /v1/preflight`;
2. proceeds only with a valid, explicit permit and preflight handle;
3. sends the exact operation to `POST /v1/connectors:invoke`.

The daemon validates the plan, consumes the handle once, decides policy,
resolves the credential, executes the provider operation, and audits it. Pi
must not call a provider directly as a fallback. The tool name and argument
and context schemas must exactly match the v2 tool plan in the active bundle.
Connector calls also require an agent binding and a matching policy.

### Unsupported tools

The extension blocks unknown Pi tool calls. It currently does not implement
`web_search` or `search_wiki`; a policy or harness-executor registration for
those names does not add their implementation to Pi. Supporting another tool
requires a Pi-side executor plus the corresponding runtime registration and
policy path. Connector-backed work must use the connector flow, not a local
permit followed by a direct provider call.

## Verify the setup

1. `pi list` shows both packages, or the project `.pi/settings.json` contains
the project-scoped entries.
2. Start Pi and confirm the extension loads and `kei_connector` is available.
3. Confirm `kei-proxy policy show` reports an active v2 bundle.
4. Test a known-permitted operation and a deliberately unbound operation.
   The denied call must not execute, and a missing daemon, malformed response,
   timeout, stale/invalid bundle, or missing policy must fail closed.
5. For connector tests, use a disposable read. Verify the decision in
   redacted audit metadata; do not log credentials or provider payloads.

Installing packages is not proof that Pi calls are governed. Do not claim
success until the extension has been loaded and a denied operation has been
observed before execution.

## Troubleshooting

- **`kei_connector` is missing:** check `pi list`, project trust for a project
  install, then restart Pi or run `/reload`.
- **Runtime socket unavailable:** verify `kei-proxy serve` is running as the
  same OS user and that `KEI_RUNTIME_SOCKET_PATH` points to its socket. Do not
  expose the runtime token to Pi as a workaround.
- **Connector preflight denies:** verify the exact tool name and schemas, active
  v2 bundle, connector tool plan, agent binding, and matching policy. The
  extension cannot manufacture any of them.
- **An unrecognized tool is blocked:** this is intentional. Add a reviewed Pi
  executor and runtime registration; do not bypass the gate or call the
  provider directly.

## Validation commands

In a checkout of `kei-lime-pi`:

```sh
npm test
npm run typecheck
pi -e .
```

For the running installation:

```sh
pi list
kei-proxy policy show
```

## Realistic usage boundaries

- The extension covers only the tools described above. It is not a sandbox for
  Bash, MCP servers, or arbitrary Pi extensions.
- Policy and runtime registration determine what is allowed; package
  installation does not grant permission.
- Pi never receives connector credentials and must not call a provider directly
  after a local policy permit.
- For general harness setup use `kei-harness-setup`; for runtime installation,
  credential delivery, or bootstrap use `kei-runtime-setup` and `kei-cli`.
- Source of truth: `HaikeiLabs/kei-lime-pi` README and code, Pi's package and
  extension documentation, and the active v2 policy bundle.
