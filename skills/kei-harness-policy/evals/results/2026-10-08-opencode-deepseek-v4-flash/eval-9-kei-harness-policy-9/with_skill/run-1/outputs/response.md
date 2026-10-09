Here's the breakdown from the [bundle-versioning.md reference](.opencode/skills/kei-harness-policy/references/bundle-versioning.md:7-27):

| Field | Type | When it changes |
|---|---|---|
| **`bundle_id`** | UUIDv7 | Every single bundle issuance gets a new UUIDv7 — minted each time the catalog produces a bundle, even if content is identical (e.g. a half-life re-issue). |
| **`bundle_version`** | uint64 | Strictly increasing counter **per runtime installation**. Bumped on every issuance of a bundle for that installation, regardless of whether policy content changed. Used for rollback protection (proxy rejects any candidate ≤ its highest activated version). |
| **`policy_revision`** | uint64 | Workspace-wide counter that increases **only on policy-affecting changes** (create, update, delete, reorder). All installations targeting the same workspace see the same revision after a change. The catalog reuses a stored bundle if the revision matches, the bundle is unexpired, and it was issued within 6 hours — otherwise a new bundle is minted. |

Key takeaway: Two bundles can share the same `policy_revision` but have different `bundle_id`/`bundle_version` if the first was re-issued at the half-life mark without any policy change. `bundle_id` changes on every mint; `bundle_version` changes on every mint per installation; `policy_revision` changes only when someone actually edits policies in the workspace.
