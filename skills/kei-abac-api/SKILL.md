---
name: kei-abac-api
description: Use the Kei ABAC HTTP API (/api/v1/*) to manage organizations, workspaces, data connectors, groups, policies, users, invitations, agents, access levels, roles, consents, and audit. Use when creating or managing any of these resources, minting harness keys, or calling the runtime surface — this is where org management lives today; the kei CLI has no org commands. Covers the three distinct auth schemes (CLI bearer, harness/runtime bearer, browser session cookie) and which endpoints accept which.
---

# Kei ABAC API

The ABAC engine (`kei/cmd/abac-engine`) is the HTTP API where organization
management actually lives. It exposes **94 distinct `/api/v1/*` routes**,
enumerated from the route table in `cmd/abac-engine/main.go`. The kei CLI has no
`org`, `workspace`, `connector`, `group`, `policy`, or `user` commands — every
one of those operations is done through this API.

Read `references/routes.md` in this skill directory for the complete route
table grouped by resource (every path and HTTP method below is traceable to that
table and to `cmd/abac-engine/main.go`).

## Install

The ABAC API is an HTTP service — consuming it needs no install, and there is no
client package to install. To build and test the engine yourself from the kei
repo, use the go toolchain:

```bash
cd cmd/abac-engine && go build ./...
```

The engine is built from source (see Validation commands); there is no published
package for it.

## Resource groups

| Group | Primary routes (group prefix) | What you do here |
| --- | --- | --- |
| Organizations | `/api/v1/organizations`, `/onboarding/organizations` | Create and list orgs; set default model profile; members (`/{id}/members`); credential store (`/{id}/credential-store`); model profiles (`/{id}/model-profiles`); credential bindings (`/{id}/credential-bindings`) |
| Workspaces | `/api/v1/workspaces` | Create/list/get workspaces; change plan (`/{id}/plan`); members (`/{id}/members`); seats (`/{id}/seats`); org-scoped workspaces under `/api/v1/organizations/{id}/workspaces` |
| Data connectors | `/api/v1/data-connectors`, `/api/v1/connections` | Create/list/get connectors; update status (`/{id}/status`); manage connection presets (`/connections`, `/connections/{id}`) |
| Groups | `/api/v1/groups` | Create/list groups; add users (`/{id}/users`); external-group sync (`/groups/sync`, `/groups/external*`) |
| Policies | `/api/v1/policies` | Create/list/update/delete ABAC policies; `src`/`dst` pattern rules |
| Users | `/api/v1/users` | Create/list/get/update users; list a user's workspaces |
| Invitations | `/api/v1/invitations` | Create/list/get/delete invitations; accept via `/{token}/accept` |
| Agents | `/api/v1/agents` | Create/list/get/update/delete agents; start/stop/reconcile; list and mint agent keys (`/{id}/keys`) |
| Access levels | `/api/v1/access-levels`, `/api/v1/organizations/{id}/access-levels` | Per-user database and agent access (`allowed_databases`, `allowed_agents`) |
| Roles | `/api/v1/orgs/{org_id}/roles`, `/api/v1/roles/{id}`, `/api/v1/service-principals`, `/api/v1/role-requests` | Custom org roles; role service principals; role requests and approve/deny |
| Authorization | `/api/v1/authorize` | The ABAC decision endpoint: subject/action/resource → `allow`/`deny` |
| Consents | `/api/v1/consents`, `/api/v1/consent-requests` | Provider consent grants and consent requests (confirm via `/{token}/confirm`) |
| Audit | `/api/v1/audit`, `/api/v1/audit/query*` | List audit logs/events/records; governed, ABAC-checked audit queries |
| Runtime | `/api/v1/runtime/*` | Harness-facing: `whoami`, `agents`, `heartbeat`, `credential-bindings`, `credential-delivery/claim|ack`, `credential-sync-keys`, `model-profiles` |
| Internal | `/api/v1/internal/*` | Device-authorization flow, harness-identity, runtime-installations and lifecycle (bind/disable/revoke/rotate) |

## How authorization is decided

`POST /api/v1/authorize` is the ABAC decision endpoint. The request carries the
harness token (or user identity) plus `action`, `resource`, `service`, `agent_id`,
and optionally `workspace_id`; the response is `{decision, reason, org_id, ...}`
where `decision` is `allow` or `deny`.

- Policy selection is **single-tenant**: with a harness token it is the org the
  token is bound to; on the user-only path it is the org the resolved user belongs
  to. Only that org's policies and global (`org_id IS NULL`) platform defaults are
  eligible, so another tenant's policies can never decide a request.
- Within the tenant the boundary narrows to the resolved workspace:
  workspace-scoped policies match only their workspace, legacy org-scoped
  policies (`workspace_id NULL`) match only in the org's default workspace, and
  global defaults always apply. An unresolvable explicit workspace **fails closed**.
- A `harness_token` that binds a workspace uses it; otherwise the org default
  workspace applies. User requests resolve through an explicit, membership-checked
  workspace, then first membership, then the org default.
- Subjects resolve through `user_consents` (`provider_user_id` → `user_id`),
  groups, and `org:<role>` memberships; policies match `user:`/`email:`/`group:`
  patterns or wildcards.
- Guests (a `provider_user_id` with no matching user) are denied with
  `guest_requires_signup` for any non-`public:*` action.

## Three distinct auth schemes — do not collapse them

There are exactly three authentication schemes a client can present, and the API
treats them differently. They are **not interchangeable**.

### (a) CLI bearer token — subject is a HUMAN, admin-only and org-bound

- Obtained via the **OIDC/SSO device-authorization flow**: `POST /api/v1/internal/cli-device-authorizations` (start), `/poll`, `/approve`. The CLI reaches these as `/api/cli/device/authorize` and `/api/cli/device/token` on the web app, which forwards.
- The subject is a human user who is `owner` or `admin` of the target org. Approval records **both `approved_user_id` and `org_id`**, and the approve handler refuses any non-owner/admin with 403 "organization administrator role is required" (`cmd/abac-engine/cli_device_auth.go:195-201`; also enforced in `cmd/web/main.go:1106-1114`). A non-admin can start a flow but can never get it approved.
- The token is bound to the org selected at approval time. It grants access to that one org.
- Stored by the CLI in the OS keychain (service `kei-cli`), sent as `Authorization: Bearer`.
- On the wire it is a short-lived JWT whose claims carry the org scope
  (`type: "cli"`, `scope: "cli:deploy"`, `org_id`). The web app validates it with
  `validateToken` via `cliOrganizationFromRequest` and reads the `org_id` claim
  (`cmd/web/main.go`), so a client cannot switch tenants by editing a request.

### (b) Harness/runtime bearer token — subject is an INSTALLATION

- Scoped to `org_id` + `agent_id` + `service`. Minted by `POST /api/v1/organizations/{id}/harness-keys` and `POST /api/v1/agents/{id}/keys`; revoked by `DELETE /api/v1/keys/{key_id}`.
- Stored **only as a sha256 `token_hash`** (`cmd/abac-engine/pkg/handlers/harness_keys.go:113`); the plaintext is returned exactly once (`Token json:"token,omitempty"`) at mint time. Supports `expires_at`.
- Authenticates the **runtime surface**: `/api/v1/runtime/whoami`, `/api/v1/runtime/agents`, `/api/v1/runtime/heartbeat`, `/api/v1/runtime/credential-bindings/*`, and the credential-delivery claim/ack endpoints, by joining `harness_keys` to `runtime_installations` (`cmd/abac-engine/runtime_installations.go`). `/api/v1/authorize` takes a `harness_token` in the request body instead.
- These endpoints are **exempt from the service credential** (see below) so customer-hosted runtimes never receive the internal API secret.

### (c) Browser session cookie — subject is a human in the web UI

- The web UI (`cmd/web`) authenticates via OIDC/SSO through the oidc-bridge and keeps a browser session cookie (~127 session/cookie references in `cmd/web/main.go`). The web app then calls the ABAC engine on the user's behalf with org scope from the session.

### CRITICAL

Schemes **(a)** and **(b)** are **both** `Authorization: Bearer` on the wire and
are **indistinguishable by header alone**. They resolve through different tables
to different subject types (a human admin vs. an installation). Do not collapse
them into one scheme, and do not assume an endpoint accepts one because the
header looks the same as the other.

### Infrastructure note: the service credential is not a fourth client scheme

Endpoints behind the web proxy are additionally guarded by the **`X-KEI-API-Key`**
application-layer service credential (`cmd/abac-engine/main.go`,
`APIAuthMiddleware`). This is the trusted-web-proxy → engine credential; it is
deliberately not `Authorization:` (that header belongs to the platform transport
layer). `/health`, `/metrics`, `/api/v1/authorize`, and `/api/v1/runtime/*` are
exempt from it. This is **not** a client-facing scheme.

## Which endpoints take which scheme

- **CLI bearer (a):** the CLI-facing routes the web app exposes (`/api/cli/device/*`, `/api/cli/runtime-installations*`). The ABAC engine's `/api/v1/internal/runtime-installations*` and `/api/v1/internal/cli-device-authorizations*` are called **by the web proxy** (service credential + org scope), never directly by the CLI with its bearer token.
- **Harness bearer (b):** `/api/v1/runtime/*` (whoami, agents, heartbeat, credential-bindings, credential-delivery, model-profiles) and `/api/v1/authorize` (`harness_token` body field).
- **Browser session (c):** everything the web UI drives, forwarded by the web proxy with `org_id` scope from the session.
- **Everything else** is reached by a client through the web proxy, which requires a valid session (c) or CLI login (a) and forwards to the engine with the service credential plus org scope.

## Cross-tenant 404 is intentional

`authorizeAgentOrg` (`cmd/abac-engine/pkg/handlers/harness_keys.go`) resolves an
agent **under the caller's supplied org scope**. A cross-tenant mismatch is
reported as **404 "agent not found", not 403** — so an attacker guessing agent
IDs cannot confirm another tenant's agent exists. 403 would be an enumeration
hole. Document this as deliberate; **do not** "fix" it to 403 and do not report
it as inconsistent error handling.

## Rate limiting

The engine rate-limits per caller IP, combined with `org_id` query param when
present (default 10 req/s, burst 20, configurable). Behind a load balancer the
trusted web proxy stamps `org_id` so each tenant gets its own bucket. A
rate-limited request returns 429.

## Validation commands

```bash
# Confirm the route table against the code (kei repo):
rg 'r\.HandleFunc\("/api/v1' cmd/abac-engine/main.go | sed -E 's/.*HandleFunc\("([^"]+)".*Methods\(([^)]*)\).*/\1 \2/' | sort | uniq
# Count distinct /api/v1 paths (expect 94):
rg 'r\.HandleFunc\("/api/v1' cmd/abac-engine/main.go | grep -oE '"/api/v1[^"]*"' | sort -u | wc -l

# Build and test the engine (kei repo):
cd cmd/abac-engine && go build ./... && go test ./...

# Verify the admin-only approve gate (kei repo):
rg -n "organization administrator role is required" cmd/abac-engine cmd/web

# Verify the intentional cross-tenant 404 (kei repo):
rg -n "agent not found" cmd/abac-engine/pkg/handlers/harness_keys.go
```

## Realistic usage boundaries

- **Do not** claim a CLI command exists for org management. It does not; this API is the surface.
- **Do not** collapse the three auth schemes. CLI bearer = human admin + org-bound; harness bearer = installation; session cookie = web UI. Header alone cannot tell (a) from (b).
- **Do not** treat `X-KEI-API-Key` as a client credential; it is the web-proxy → engine service credential and is not part of the client auth model.
- **Do not** change the cross-tenant 404 to 403. It is the security control against agent-ID enumeration (see `authorizeAgentOrg`).
- **Do not** assume the OpenAPI/documentation matches the code on every detail; the route table in `cmd/abac-engine/main.go` and this skill's `references/routes.md` are the ground truth. If they disagree, the code wins.
- Key minting (`POST /organizations/{id}/harness-keys`) is security-sensitive: the plaintext token is returned once and only the sha256 hash is stored. Do not log or persist the plaintext.
