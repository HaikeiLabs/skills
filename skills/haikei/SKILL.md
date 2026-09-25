---
name: haikei
description: Discover Haikei's public Kei platform skills when the user describes a need without naming a product. Route API resource management, runtime administration, runtime authorization, harness setup, credential rotation, SDK policy and audit, or installation troubleshooting to the relevant skill.
---

# Haikei skill router

Use this router when a request concerns Haikei's Kei platform but the user has
not named a specific interface. Load the focused skill for the task and check
current public documentation for version-specific details.

| User need | Skill |
| --- | --- |
| Manage organizations, workspaces, connectors, groups, policies, users, invitations, agents, access levels, or roles | `kei-api` |
| Define agent capabilities, tool schemas, and governed connector reads | `kei-agents` |
| Design or review a public API resource or action | `kei-api-conventions` |
| Install or administer the `kei` CLI and runtime installations | `kei-cli` |
| Set up a customer-hosted runtime | `kei-runtime-setup` |
| Authorize governed operations from a runtime | `kei-proxy` |
| Rotate or revoke a runtime credential | `kei-credential-rotation` |
| Connect a supported coding harness to Kei | `kei-harness-setup` |
| Apply policy and audit to agent tool calls with the SDK | `agentware-sdk` |
| Diagnose a runtime installation | `kei-setup-doctor` |

Use the installed CLI help and current public Kei documentation for exact
commands, routes, authentication, and supported configuration. Do not infer
undocumented operations from a product name or from internal implementation
details.

## Keep the interfaces distinct

- The Kei API manages documented platform resources.
- The `kei` CLI supports the administrative workflows shown by its installed
  help.
- `kei-proxy` authorizes and performs governed runtime operations.
- The Agentware SDK provides reusable policy and audit middleware for a
  harness. It does not replace the proxy's governed connector execution.

When documentation does not describe a requested operation, state that clearly
and direct the user to the platform owner for the supported workflow.
