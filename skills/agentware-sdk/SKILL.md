---
name: agentware-sdk
description: Integrate the Agentware SDK for policy enforcement and audit around agent tool calls. Use for middleware, caller context, allow/deny/filter decisions, delegation, audit redaction, or supported language package details.
---

# Agentware SDK

Agentware is middleware between an agent harness and tool execution. It applies
policy, records an audit of each governed call, and passes a call to the tool
executor only when policy permits it. It complements Kei runtime governance;
it does not resolve customer credentials or execute governed connectors.

## Integration principles

- Validate tool names and arguments against the harness's supported registry.
- Carry authenticated caller and delegation context separately from user text.
- Represent authorization as an explicit allow, deny, or filtered decision.
- Return bounded, typed results and stable correlation identifiers.
- Fail closed when identity is missing, policy cannot be evaluated, or a
  required dependency is unavailable.
- Audit only the metadata needed to explain a decision. Redact credentials,
  unnecessary user content, and private model reasoning.

When a provider exposes reasoning, retain bounded events and evidence
references rather than raw private reasoning. Test permitted and denied calls,
malformed input, missing identity, tool failures, and audit redaction.

## Language packages

The SDK has Go, Python, and TypeScript implementations. Some published package
and import identifiers retain legacy branding for compatibility; use these
exact identifiers when installing or importing the current packages:

- Go module: `github.com/soypete/pedro-agentware/go`
- Python distribution/import: `pedro-agentware` / `pedro_agentware`
- TypeScript package: `@pedro/agentware`

Install from the public Agentware repository or a package registry documented
by the current release. Do not assume an unpublished package is available from
a registry. Check that language port's README and tests for exact types,
methods, argument order, and failure behavior before implementing an adapter.

## Kei integration boundary

Use the documented Kei runtime integration when a harness needs platform
authorization. Keep runtime credentials in a protected secret store or
environment injection; never pass them in arguments, logs, or audit records.
The runtime identity establishes its authorized scope. Do not let user input
or a harness manifest widen that scope.

Agentware middleware can also be used with a local policy and auditor without
Kei. In either mode, middleware decides and audits tool calls; the harness owns
the agent loop, and the runtime proxy owns governed connector execution.

## Validation

Run the language port's documented build, lint, and tests from its repository.
Use deterministic test doubles for the default test suite and reserve live
provider integrations for explicitly configured environments. Treat source and
tests for the selected release as authoritative when older examples differ.
