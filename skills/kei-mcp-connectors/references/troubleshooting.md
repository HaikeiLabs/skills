# Remote MCP connector troubleshooting

Use the exact message or reason code to choose the next step. Resolve OAuth,
workspace, manifest, and policy problems independently; a policy change cannot
create a missing manifest.

| Message or reason | What it means | Next step |
| --- | --- | --- |
| `connector_has_no_tools` | The workspace admin has not connected the MCP account, or no usable tool manifest is available yet. | Connect as a workspace admin first. Then make a first tool-list call from a harness, inspect the candidate with `kei connectors manifests list` and `show`, and have an admin approve it. Do not create a policy for this reason. |
| `No tool manifests yet` | The runtime has not submitted a manifest. OAuth connect does not make the first tools/list request. | Ask the harness to list the MCP server's tools, then list manifests again. |
| `no_matching_policy` | No policy matched the caller and connector target. This is an access-policy problem, not a manifest problem. | Ask the admin to inspect the applicable policy and group membership. Older connectors may lack the default `admins` group permit; an admin must add it. |
| `policy_deny` or an HTTP 403 policy-deny message | A matching policy explicitly denies the request. | Ask the admin to review the denying policy and intended scope. Do not create or widen a policy without admin approval. |
| `failed to start OAuth connect flow` | An older catalog or bridge may not support the current MCP OAuth connect flow. | Ask the platform owner to confirm the deployed catalog/bridge versions and upgrade path. Do not work around it by collecting credentials in chat. |
| `no OAuth registration in this organization is for the resource's authorization server` | On deployments before bridge auto-registration, this organization has no OAuth registration for the MCP server's authorization server. | Version-dependent: after HAI-804 is deployed, the bridge registers automatically. Before deployment, ask the platform owner to arrange the organization OAuth registration. |
| `workspace not found` or a UUID-shaped workspace error | Connector `--workspace` resolves a workspace name; UUID input is rejected. | Run `kei workspaces list` and retry with the exact workspace name. Verify spelling and case. |
| `not logged in`, HTTP 401, or expired login | The admin CLI token is missing, expired, or for another environment. | Run `kei login` against the intended environment, then retry. Never copy the login token into a prompt or command argument. |

For full command syntax, use the `kei-cli` skill. For invocation denials and
runtime reason codes beyond setup, use `kei-proxy` and `kei-harness-policy`.
