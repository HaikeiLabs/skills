---
name: kei-api
description: Use the Kei API to integrate with organizations, workspaces, data connectors, groups, policies, users, invitations, agents, access levels, and roles. Load when building a client or choosing an API workflow; use current public Kei API documentation for endpoint and authentication details.
---

# Kei API

The Kei API lets authorized applications and administrators work with platform
resources, including organizations, workspaces, data connectors, groups,
policies, users, invitations, agents, access levels, and roles. Use it when
integrating a client or automating a supported workflow.

## Use current API documentation

API routes, request schemas, and authentication requirements can change. Before
writing a request, consult the current public Kei API documentation and follow
the documented client authentication flow. Do not infer routes, send internal
service credentials, or rely on undocumented endpoints.

For a compact overview of documented resource paths, see
[the public route reference](references/routes.md). Confirm that an operation
is currently supported before using it.

Keep credentials in an approved secret store or environment injection. Do not
place credentials in source files, command-line arguments, logs, or API
examples. Scope requests to the organization and workspace the caller is
authorized to access, and handle denied or missing resources without exposing
data across tenants.

## Choose the right interface

- Use the Kei console for interactive administration when the console supports
  the task.
- Use the `kei` CLI for the runtime and installation workflows documented by
  the CLI's installed help.
- Use the Kei API for documented resource operations and integrations.
- Use `kei-proxy` to authorize and execute governed runtime operations.

Do not invent CLI commands or API routes. If current public documentation does
not describe the needed operation, explain that and ask the platform owner for
the supported workflow.
