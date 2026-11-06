# Skills

Each child directory contains one distributable skill with a required
`SKILL.md`. Skills are added through reviewed pull requests and validated by
the scripts in `scripts/` (see the repo README).

| Skill | Description |
| --- | --- |
| `agentware-sdk` | Policy/audit middleware for agent tool calls in Go, Python, and TypeScript |
| `discord-connector` | Discord connector that Kei checks — REST API, guild/channel/thread/message model, policy types |
| `github-connector` | GitHub connector that Kei checks — `gh` CLI, REST API, entity model, policy types |
| `google-drive-connector` | Google Drive connector that Kei checks — Drive API v3, file/folder model, export patterns |
| `grafana-connector` | Grafana connector that Kei checks — REST API, folder/dashboard/panel/datasource model, policy types |
| `haikei` | Router skill — discovers and routes to the right Haikei product skill |
| `kei-agents` | Agent tool definitions, schemas, permissions, connector read schemas for connectors Kei checks |
| `kei-api` | Kei API contracts for organizations, workspaces, connectors, policies |
| `kei-api-conventions` | Resource-oriented API endpoint conventions (AIP-style) |
| `kei-ingress-security` | Fail-closed ingress boundary security invariants for a customer assistant |
| `kei-cli` | `kei` CLI platform-administration commands |
| `kei-credential-rotation` | Rotate runtime installation credentials |
| `kei-harness-policy` | Harness command policies — import, create, verify, and export shell:/skill:/path: policies; register harnesses and sync tool registrations |
| `kei-harness-setup` | Connect coding-agent harnesses to Kei policies |
| `kei-headless-evals` | Headless deterministic evaluation harnesses |
| `kei-openai-backends` | OpenAI-compatible LLM backend integration |
| `kei-proxy` | `kei-proxy` runtime — authorize, credential release, heartbeat, collector |
| `kei-runtime-setup` | Stand up customer-hosted Kei runtimes |
| `kei-setup-doctor` | Diagnose Kei runtime installations |
| `kei-teams-ingress` | Microsoft Teams / Bot Framework integration |
| `kei-tool-adapters` | TypeScript tool adapters and governor tool-lane pattern |
| `linear-connector` | Linear connector that Kei checks — GraphQL API, issue/team/cycle model, policy types |
