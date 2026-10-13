# Tool packs and the boot tool sync

Source: the `kei-openwebui` repository (`docs/release.md` "Layer a tool pack",
`docs/design.md` "Tool packs" and "Tool sync", `src/kei_openwebui/boot.py`,
`src/kei_openwebui/tool_sync.py`).

## TOOLKITS

The pack's top-level module (the name in `KEI_OPENWEBUI_TOOL_PACKS`) defines
`TOOLKITS`, a non-empty list of plain-data entries. The pack never imports
`kei_openwebui`.

| Toolkit field | Required | Rule |
| --- | --- | --- |
| `id` | yes | Open WebUI tool id, `[a-z0-9_]+`, unique across packs |
| `name` | yes | Display name |
| `module` | yes | Module that defines Open WebUI's `Tools` class |
| `description` | no | String |
| `source` | no | Default Kei `source` for its tools (else the pack's module name) |
| `tools` | no, but needed to be governed | Governed tool declarations |

| Tool field | Required | Rule |
| --- | --- | --- |
| `name` | yes | `[a-z0-9_]+(\.[a-z0-9_]+)*`, at most 128 characters, declared once across all packs |
| `access` | yes | `read` or `write`, exported as `operation_class` |
| `source` | no | `[a-z][a-z0-9_]{0,63}` |
| `required_capabilities` | no | List of distinct strings without whitespace |
| `resource_types` | no | List of `{"type": ..., "parent_type": ...}` |
| `service` | no | String without whitespace |
| `method` | no (v0.1.3+) | The public `Tools` method that runs the tool, when its name differs; named by one declaration only. Not exported |

A malformed entry, or a name declared twice, stops boot and names the pack and
entry, for example
`acme_orders: TOOLKITS[0].tools[1] ('acme.orders.get_order') field 'access' must be 'read' or 'write', got 'reed'`.

Plain-data `tools` is v0.1.2 and later. Older forms still load: a module-level
`TOOL_SPECS` list, or `kei_openwebui.governed_tools.ToolSpec` constants with a
`source` (the v0.1.1 form).

## The name is the action

The `Tools` method passes `Governor.run` a spec with the declared name, and Kei
is asked about `tool:<name>`. The policy's `--dst-pattern` must be exactly
`tool:<name>`. Name the tool `<method>` or `<prefix>.<method>`
(`acme.orders.list_orders` → `list_orders`), or, from v0.1.3, name its method in
`method` (`{"name": "acme.orders.get_order", "access": "read", "method": "orders_get"}`).
A `method` the `Tools` class doesn't define publicly, or one two declarations
name, stops the container. Boot matches methods to declarations that way and
warns about any method without one:

```
kei-seed: tool sync: acme_orders.cancel_order is left out of the manifest: <reason>
```

Fix it with `method` (v0.1.3+). Before v0.1.3, if the registered count is right
and each method sends its declared name, the warning is diagnostic only. If a method sends a name that isn't registered,
Kei refuses the call (`tool_not_registered`). A pack test that calls each
method and checks the name it sends catches drift.

## The boot tool sync

`python -m kei_openwebui.boot --sync-tools` runs after kei-proxy is ready and
before Open WebUI serves:

- `PUT $KEI_RUNTIME_CONTROL_PLANE_URL/api/v1/runtime/tools`
- `Authorization: Bearer $KEI_RUNTIME_TOKEN`
- content type `application/vnd.kei.tool-manifest.v2+json`, the document
  `--export-manifest` prints

| Situation | Log | Result |
| --- | --- | --- |
| Success | `kei-seed: tool sync: registered N tool(s) with Kei at /api/v1/runtime/tools (added=…, removed=…, unchanged=…, updated=…)` | Boot continues |
| No pack configured | `tool sync skipped: no tool packs configured (KEI_OPENWEBUI_TOOL_PACKS is empty)` | Boot continues |
| Pack configured, no tools exported | `tool sync refused: KEI_OPENWEBUI_TOOL_PACKS=… is set but its manifest has no tools. …` | Container refuses to start |
| Pack doesn't import or validate | `tool pack rejected: …` | Container refuses to start |
| Kei refuses, or network error | `tool sync attempt n/5 failed (…); retrying in …`, then `tool sync with Kei failed: PUT /api/v1/runtime/tools failed after 5 attempt(s): HTTP <status>: …` and `registering the tool packs' tools with Kei failed; refusing to start Open WebUI` | Container exits |

- The PUT **replaces** the installation's tools. Every boot converges Kei on
  the current packs, and a dropped tool is unregistered.
- An empty manifest is never sent: it would unregister every tool.
- The token never appears in the log.
- Tools reach kei-proxy on its next bundle poll (60 s by default).

HTTP statuses: 401 is a wrong or rotated token. 404 is a wrong control plane URL
(it must have no path). 409 means the name is already registered in the
workspace by an admin or another installation. 400 means an invalid manifest;
the message names the field.

## v0.1.0

v0.1.0 never syncs. Register the tools by hand from inside the container (the
script is in `kei-openwebui` `docs/release.md`, "v0.1.0: register the tools by
hand"), and check the export isn't empty first. Better: upgrade.
