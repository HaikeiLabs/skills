---
name: kei-agents
description: Use the Kei Agents package to define agent capabilities, tool schemas, permission gates, model-specific tool rendering, and governed connector read capabilities.
---

# Kei Agents

The `kei-agents` package defines agent capabilities, tool schemas, permission
gates, and semantic mappings. It does not run provider clients or resolve
customer credentials. Governed connector operations execute in the customer's
runtime through the supported Kei runtime workflow.

## Install

Follow the current public Kei developer documentation for package installation
and availability. For source development, use the package's documented
development setup. Do not copy private registry settings or credentials into
project configuration.

## Define tools

The Python package uses the `agents` import namespace:

```python
from agents import TOOL_DEFINITIONS, ModelFormat, render_tools

tools = render_tools(TOOL_DEFINITIONS, ModelFormat.OPENAI)
```

The public surface includes model formats, tool definitions and bindings,
connector read schemas, format renderers, lookup and validation helpers, and
policy evaluation types. Confirm exported symbols against the installed
package version before using them.

Core concepts:

- `ModelFormat` selects a tool schema format supported by the target model.
- `Permission` expresses the permission gate for a tool.
- `ToolDefinition` describes its name, parameters, permissions, category, and
  optional connector binding.
- `ToolBinding` carries non-secret routing metadata and delegated context.
- Policy evaluation results should represent allow, deny, or require approval
  as explicit outcomes.

Connector read schemas describe supported operations such as listing or
retrieving records. Keep write operations as agent action tools unless the
current Kei API and runtime documentation explicitly supports a governed write
capability.

## Security boundaries

- Never put credentials, provider clients, or customer payloads in tool
  definitions or bindings.
- Do not put arbitrary endpoints in connector bindings. Use the configured
  connector and the supported runtime to resolve destination and credentials.
- Do not let an agent choose organization, tenant, or workspace scope through
  tool arguments. Carry authorized scope as trusted runtime context.
- Keep policy and audit checks around tool execution. A schema describes a
  capability; it does not grant permission by itself.
- Do not execute customer connector operations in the Kei metadata catalog.

## Validation

Use the installed package's validation helpers and the public development
checks for the version in use. Validate tool definitions before registering
them, and test denied, malformed, and missing-identity cases as well as
permitted calls. Keep provider execution and secrets in the customer runtime.
