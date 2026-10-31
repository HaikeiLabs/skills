# Policy bundle versioning

Kei distributes policy to runtime installations in policy bundles. For the
human-facing explanation of policy behavior, use the Policies and Groups
reference pages in the Kei console. This page summarizes the version fields
needed when diagnosing a harness sync.

## Version fields

| Field | Meaning |
| --- | --- |
| `bundle_id` | Identifies a particular bundle issuance. |
| `bundle_version` | Monotonically increasing version for an installation. |
| `policy_revision` | Workspace policy revision represented by the bundle. |

A policy change advances the workspace revision. A runtime may receive a new
bundle issuance with the same policy revision when the control plane renews the
bundle. Compare `policy_revision` to see whether policy content changed;
`bundle_id` and `bundle_version` identify the issued bundle.

The bundle policy model uses typed targets. Standing policy sources are custom
groups (`group:<name>` or a bare group name), `autogroup:member`, and
`autogroup:admin`; owners count as admins. Custom groups may contain users,
agents, and service principals. Direct subjects receive access only through
ID-based grants with an expiry, reason, and approver. Never use email addresses
or org roles as policy sources. Matching denies win, there is no priority, and
bindings are wiring that does not authorize access.

## Inspect and refresh

Use the proxy's supported commands to inspect or refresh the local bundle:

```sh
kei-proxy policy show
kei-proxy policy sync
```

`policy show` reports the active bundle state and version information without
printing policy contents. `policy sync` requests a fresh bundle. After policy
changes, run `kei harness sync --dry-run` to inspect the native configuration
rendered from the policy available to that runtime.

Follow the installed `kei-proxy` help and the Policies reference in the Kei
console for current behavior. Do not infer effective access from a bundle
version alone; evaluate the target for the relevant group with `kei policy
test` and inspect harness sync output where native rendering is involved.
