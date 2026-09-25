---
name: kei-api-conventions
description: Design or review public Kei API endpoints using resource-oriented conventions. Use when adding a resource, choosing HTTP methods, designing custom actions, pagination, update masks, or stable API errors.
---

# Kei API conventions

Use resource-oriented routes so clients can work with Kei resources through
consistent HTTP methods and predictable schemas. Check current public API
documentation and platform contribution guidance before applying these rules
to a specific endpoint.

## Resource and route shape

- Name collections with plural, lowercase kebab-case nouns, such as
  `connector-bindings` or `approval-requests`.
- Identify a resource by its collection and member path. Keep collection and
  member segments distinct so each `{id}` refers to the preceding collection.
- Use `GET` to list or get, `POST` to create, `PATCH` to update, and `DELETE`
  to delete. Use an explicit update mask when the API supports partial updates.
- Paginate list operations with an opaque page token and a bounded page size.
  Avoid offset-based pagination for new resources.
- Return stable machine-readable error reasons alongside human-readable
  messages so clients do not need to parse message text.

## Custom actions

Use a `:verb` suffix for a state change that cannot be expressed as a field
update, for example:

```text
POST /api/v1/agents/{id}:start
POST /api/v1/role-requests/{id}:approve
POST /api/v1/groups:sync
```

Use ordinary updates for changes that can be represented as resource fields.
Keep each custom action explicit instead of encoding several actions in a
single route variable.

## Compatibility and review

When evolving an existing public endpoint, preserve compatibility for current
clients and follow the platform's published migration guidance. Review route
authorization, tenant and workspace scope, audit identity, pagination, and
error behavior with the resource contract. Do not expose internal service
routes or undocumented credentials as client workflows.

## Validation

Use the API schema and contribution checks documented for the public Kei API
repository. Verify that the route, request and response schemas, authorization
scope, and client behavior agree before release. Do not treat a linter as a
substitute for reviewing whether an operation belongs in the resource model.
