# MCP connectors and tool manifests in the `kei` CLI

Depth for the `kei-cli` skill. The commands below need `kei` v0.1.32 or
later (older releases do not have them). Run `kei help` and `kei connectors manifests` (no arguments) on
the installed binary first; if they are missing, upgrade or use the console.

## The model (kei ADR-036)

- A **connector template** comes from the catalog (`GET
  /api/v1/connector-templates`). Its `kind` is `native`, `http_api` or `mcp`.
  The CLI keeps no template list; whatever templates the catalog serves can be
  used.
- An **MCP connector** is a remote MCP server (streamable HTTP or SSE, never
  stdio). Its users connect their own accounts with OAuth, per user. There is
  no shared secret, so `create` reads nothing from stdin.
- The connector's tools come **only** from its approved **tool manifest**. The
  runtime lists the server's tools and submits every manifest it cannot verify
  as a **candidate**. An organization admin reviews the candidate and
  approves it. Until then, list and call fail closed.

## Create

```sh
kei connectors create --workspace WS --template TEMPLATE_ID --label "LABEL" \
  [--kind mcp] [--slug SLUG] [--mcp-url https://HOST/mcp] [--expected-issuer https://ISSUER] [--json]
```

- `--template` and `--label` are required. `--kind` only checks the
  template's kind: a mismatch fails before anything is created.
- `--mcp-url` is required when the template has no URL of its own (for
  example `custom_mcp`). It must be `https`.
- `--slug` is the workspace-unique name harnesses use (`^[a-z][a-z0-9_]{1,47}$`).
  It defaults to one derived from the label and cannot be changed later. The
  command prints the slug.
- `--expected-issuer` pins the OAuth authorization server the MCP server
  must use, compared exactly. If the catalog is too old to store it, the CLI
  deletes the connector it just created and fails, rather than leave one that
  trusts any authorization server.
- `--template` cannot be combined with `--provider` or the provider path's
  flags (`--account-model`, `--set`, `--credential-ref`, `--capabilities`,
  the `http_api` flags).
- A template of another kind is created with `--provider TEMPLATE_ID`
  instead; the CLI says so.

Example, for a custom server:

```sh
kei connectors create --workspace Main --kind mcp --template custom_mcp \
  --label "Grafana (prod)" --mcp-url https://grafana-mcp.example.com/mcp
```

## Inspect

```sh
kei connectors list --workspace WS [--manifests]   # SLUG, KIND, MCP URL; --manifests adds MANIFEST status
kei connectors get CONNECTOR_ID --workspace WS     # Label, Slug, Kind, MCP URL, Issuer, Manifest
```

`get` of an mcp connector prints a `Manifest:` line, for example
`approved (12 tools); candidate <id> pending review`.

## Review and approve tool manifests

`tools` is an alias for `manifests`.

```sh
kei connectors manifests list CONNECTOR_ID --workspace WS
kei connectors manifests show CONNECTOR_ID [MANIFEST_ID] --workspace WS [--json]
kei connectors manifests approve CONNECTOR_ID MANIFEST_ID --workspace WS [--yes]
```

- `show` without a manifest ID shows the newest candidate awaiting review, and
  its changes since the approved manifest: `+` added, `-` removed, `~`
  changed (description or inputSchema).
- `approve` needs the manifest ID; it never picks one. It shows the same
  changes, then asks `Continue? [y/N]`. Scripts pass `--yes`. Without a
  terminal and without `--yes` it refuses and approves nothing.
- Only an organization owner or admin can approve (403 otherwise). A
  superseded manifest is refused (409). Approving replaces the connector's
  current approval.
- Tool names and descriptions come from the MCP server, so the CLI replaces
  control characters in them before printing.

## Not in the CLI

- Submitting a manifest: the runtime does that, with its runtime token.
- Creating or editing connector templates.
- Granting a connector to a group: that is a policy (`kei policies`, or the
  console), not a connector field.
