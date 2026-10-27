# kei-mcp-connectors evals

Portable prompt-only evals for the remote MCP connector setup flow. They cover
the ordered path from activation through harness sync, the first tool-list
manifest trigger, missing-tool troubleshooting, legacy access grants, harness
policy scope, and version-dependent OAuth registration.

Run both required profiles using the repository's standard eval runner:

```sh
node scripts/run-evals.mjs --skill kei-mcp-connectors \
  --model-profile glm-5.3-flash --jobs 1 --repeats 3
turnlock.sh qwen <worker> node scripts/run-evals.mjs \
  --skill kei-mcp-connectors --model-profile qwen3.8-27b --jobs 1 --repeats 3
```

Keep generated reports in `evals-out/`. CI is the record; do not commit local
benchmark results.

## Cases

1. New MCP connector: remaining setup steps.
2. `connector_has_no_tools`: first tool listing and manifest approval.
3. `No tool manifests yet`: connect versus tool-list behavior.
4. Harness sync policy-scope warning and Codex hook trust.
5. `no_matching_policy`, older connector permit, and workspace-name selection.
6. OAuth registration error before and after bridge auto-registration ships.

## Results

| Profile | Pass rate | Errors |
| --- | --- | --- |
| `glm-5.3-flash` | — | Not run |
| `qwen3.8-27b` | — | Not run |
