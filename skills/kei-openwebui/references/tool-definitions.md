# Open WebUI tool definitions and implementations

Source: the `kei-openwebui` repository, `docs/setup.md` section 3 and `docs/design.md` sections “Tool packs” and “Tool specs from a file”; Agentware's `kei.tool-manifest/v3` docs and shared fixture.

## Definition source

Set `KEI_OPENWEBUI_TOOLS_FILE` to a manifest path inside the container when the deployment supplies tool definitions. The deployer's CI/CD provides the file, usually mounted read-only or injected by the platform. Keep it outside the image. The plugin reads it once at boot; changes require a restart.

The file uses Agentware's existing `kei.tool-manifest/v3` shape and `ToolSpec`. Do not invent an Open WebUI-specific schema. See [Agentware's v3 documentation](https://github.com/HaikeiLabs/agentware/blob/main/docs/tool-manifest-v3.md), [shared fixture](https://github.com/HaikeiLabs/agentware/blob/main/fixtures/kei/tool-manifest.v3.json), and the Acme example at `examples/tools.example.yaml`.

The manifest’s `tools` list defines registered tools. A definition includes `name`, `service`, `source`, `operation_class`, `route.harness_executor`, `description`, and `enabled`. The tool name is the Kei action and permit target, exactly `tool:<name>`.

When `KEI_OPENWEBUI_TOOLS_FILE` is set, that file is the only definition source. The generated catalog and `kei_openwebui.tool_definitions` entry points are ignored. When unset, the image uses its generated catalog from the contracts schemas as before; catalog changes require an image rebuild and redeploy.

## Implementations

Definitions do not provide executable code. Each service's installed Python package supplies a `Tools` class through the `kei_openwebui.tool_implementations` entry-point group, with the entry-point name exactly matching the manifest's `service`, for example:

```toml
[project.entry-points."kei_openwebui.tool_implementations"]
acme_orders = "acme_orders.tools:Tools"
```

Install the package in the image. At boot, the connector resolves each definition's `service` to an installed implementation and seeds its tools. Missing or invalid implementations fail startup closed.

## Registration at boot

When the file variable is set, the plugin loads YAML, unmarshals it with Agentware `ToolSpec`, and registers the manifest using `haikeilabs.agentware.kei.tool_sync.sync_tool_manifest`. This sends `PUT /api/v1/runtime/tools` with the runtime token. The generated-catalog mode uses the same boot registration path. Sync runs only at boot; a definition change takes effect after restart.

The file loader fails closed on a missing or unreadable file, invalid YAML or manifest, empty or duplicate tool lists, an unavailable service implementation, or an unknown `method`. It accepts exactly one YAML document, rejects anchors, aliases, merge keys, custom tags and duplicate mapping keys, and refuses files over 256 KiB. Registration or network failure also stops startup before Open WebUI serves.

The runtime token belongs in the deployment's secret manager as `KEI_RUNTIME_TOKEN`; never put a token in a generated skill, tool manifest, or image example. The manifest file itself is configuration supplied by deployer CI/CD.
