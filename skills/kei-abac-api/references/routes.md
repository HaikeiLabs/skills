# ABAC API route table

Enumerated from `cmd/abac-engine/main.go` (kei repo). This is the ground truth;
if a skill or doc disagrees with this table, this table and the code win.

The ABAC engine exposes **94 distinct `/api/v1/*` route paths**. Each row shows
the route path and the HTTP methods registered on it. Routes marked **(runtime)**
are the harness/runtime surface authenticated by the harness bearer scheme and
exempt from the `X-KEI-API-Key` service credential. `/api/v1/authorize` is also
exempt and takes a `harness_token` in the request body. Everything else is
reached through the trusted web proxy.

## Organizations

| Method | Route |
|--------|-------|
| GET | `/api/v1/organizations` |
| POST | `/api/v1/organizations` |
| DELETE | `/api/v1/organizations/{id}` (test-org teardown) |
| POST | `/api/v1/onboarding/organizations` |
| PUT | `/api/v1/organizations/{id}/default-model-profile` |
| GET | `/api/v1/organizations/{id}/members` |
| POST | `/api/v1/organizations/{id}/members` |
| DELETE | `/api/v1/organizations/{id}/members/{user_id}` |
| PUT | `/api/v1/organizations/{id}/members/{user_id}` |
| GET | `/api/v1/organizations/{id}/credential-store` |
| PUT | `/api/v1/organizations/{id}/credential-store` |
| GET | `/api/v1/organizations/{id}/credential-store/recipients` |
| GET | `/api/v1/organizations/{id}/model-profiles` |
| POST | `/api/v1/organizations/{id}/model-profiles` |
| GET | `/api/v1/organizations/{id}/model-profiles/{profile_id}` |
| PUT | `/api/v1/organizations/{id}/model-profiles/{profile_id}` |
| DELETE | `/api/v1/organizations/{id}/model-profiles/{profile_id}` |
| GET | `/api/v1/organizations/{id}/credential-bindings` |
| POST | `/api/v1/organizations/{id}/credential-bindings` |
| GET | `/api/v1/organizations/{id}/credential-bindings/{user_id}/{service}` |
| PUT | `/api/v1/organizations/{id}/credential-bindings/{user_id}/{service}` |
| DELETE | `/api/v1/organizations/{id}/credential-bindings/{user_id}/{service}` |

## Workspaces

| Method | Route |
|--------|-------|
| GET | `/api/v1/workspaces` |
| POST | `/api/v1/workspaces` |
| GET | `/api/v1/workspaces/{id}` |
| PUT | `/api/v1/workspaces/{id}/plan` |
| GET | `/api/v1/workspaces/{id}/members` |
| POST | `/api/v1/workspaces/{id}/members` |
| GET | `/api/v1/workspaces/{id}/seats` |
| GET | `/api/v1/organizations/{id}/workspaces` |
| POST | `/api/v1/organizations/{id}/workspaces` |
| GET | `/api/v1/organizations/{id}/workspaces/{workspace_id}/members` |
| POST | `/api/v1/organizations/{id}/workspaces/{workspace_id}/members` |
| GET | `/api/v1/users/{id}/workspaces` |

## Data connectors and connection presets

| Method | Route |
|--------|-------|
| GET | `/api/v1/data-connectors` |
| POST | `/api/v1/data-connectors` |
| GET | `/api/v1/data-connectors/{id}` |
| PUT | `/api/v1/data-connectors/{id}/status` |
| GET | `/api/v1/connections` |
| POST | `/api/v1/connections` |
| PUT | `/api/v1/connections/{id}` |
| DELETE | `/api/v1/connections/{id}` |

## Groups

| Method | Route |
|--------|-------|
| GET | `/api/v1/groups` |
| POST | `/api/v1/groups` |
| POST | `/api/v1/groups/{id}/users` |
| POST | `/api/v1/groups/sync` |
| GET | `/api/v1/groups/external` |
| GET | `/api/v1/groups/external/memberships` |
| POST | `/api/v1/groups/external/{id}/bindings` |
| GET | `/api/v1/groups/external/{id}/bindings` |
| DELETE | `/api/v1/groups/external/{id}/bindings` |

## Policies

| Method | Route |
|--------|-------|
| GET | `/api/v1/policies` |
| POST | `/api/v1/policies` |
| PUT | `/api/v1/policies/{id}` |
| DELETE | `/api/v1/policies/{id}` |

## Resources

| Method | Route |
|--------|-------|
| GET | `/api/v1/resources` |
| POST | `/api/v1/resources` |
| GET | `/api/v1/resources/{id}` |
| PUT | `/api/v1/resources/{id}` |
| DELETE | `/api/v1/resources/{id}` |

## Users

| Method | Route |
|--------|-------|
| POST | `/api/v1/users` |
| GET | `/api/v1/users` |
| GET | `/api/v1/users/{id}` |
| PUT | `/api/v1/users/{id}` |
| GET | `/api/v1/users/{id}/workspaces` |

## Invitations

| Method | Route |
|--------|-------|
| GET | `/api/v1/invitations` |
| POST | `/api/v1/invitations` |
| GET | `/api/v1/invitations/{token}` |
| DELETE | `/api/v1/invitations/{token}` |
| POST | `/api/v1/invitations/{token}/accept` |

## Agents

| Method | Route |
|--------|-------|
| GET | `/api/v1/agents` |
| POST | `/api/v1/agents` |
| GET | `/api/v1/agents/{id}` |
| PUT | `/api/v1/agents/{id}` |
| DELETE | `/api/v1/agents/{id}` |
| POST | `/api/v1/agents/{id}/start` |
| POST | `/api/v1/agents/{id}/stop` |
| POST | `/api/v1/agents/{id}/reconcile` |
| GET | `/api/v1/agents/{id}/keys` |
| POST | `/api/v1/agents/{id}/keys` |
| POST | `/api/v1/organizations/{id}/harness-keys` |
| DELETE | `/api/v1/keys/{key_id}` |

## Access levels

| Method | Route |
|--------|-------|
| GET | `/api/v1/access-levels` |
| POST | `/api/v1/access-levels` |
| GET | `/api/v1/access-levels/{org_id}/{user_id}` |
| PUT | `/api/v1/access-levels/{org_id}/{user_id}` |
| DELETE | `/api/v1/access-levels/{org_id}/{user_id}` |
| GET | `/api/v1/organizations/{id}/access-levels` |
| POST | `/api/v1/organizations/{id}/access-levels` |
| GET | `/api/v1/organizations/{id}/access-levels/{user_id}` |
| PUT | `/api/v1/organizations/{id}/access-levels/{user_id}` |
| DELETE | `/api/v1/organizations/{id}/access-levels/{user_id}` |

## Roles, service principals, role requests

| Method | Route |
|--------|-------|
| GET | `/api/v1/orgs/{org_id}/roles` |
| POST | `/api/v1/orgs/{org_id}/roles` |
| GET | `/api/v1/roles/{id}` |
| PUT | `/api/v1/roles/{id}` |
| DELETE | `/api/v1/roles/{id}` |
| GET | `/api/v1/service-principals` |
| POST | `/api/v1/service-principals` |
| GET | `/api/v1/service-principals/{id}` |
| PUT | `/api/v1/service-principals/{id}` |
| DELETE | `/api/v1/service-principals/{id}` |
| GET | `/api/v1/role-requests` |
| POST | `/api/v1/role-requests` |
| GET | `/api/v1/role-requests/{id}` |
| POST | `/api/v1/role-requests/{id}/approve` |
| POST | `/api/v1/role-requests/{id}/deny` |

## Authorization and initialization

| Method | Route |
|--------|-------|
| POST | `/api/v1/authorize` (takes `harness_token` in body) |
| POST | `/api/v1/initialize` |

## Consents

| Method | Route |
|--------|-------|
| GET | `/api/v1/consents` |
| POST | `/api/v1/consents` |
| GET | `/api/v1/consents/{id}` |
| PUT | `/api/v1/consents/{id}` |
| DELETE | `/api/v1/consents/{id}` |
| GET | `/api/v1/consent-requests` |
| POST | `/api/v1/consent-requests` |
| POST | `/api/v1/consent-requests/{token}/confirm` |

## Audit

| Method | Route |
|--------|-------|
| GET | `/api/v1/audit` |
| GET | `/api/v1/audit/agents` |
| GET | `/api/v1/audit/policies` |
| GET | `/api/v1/audit/permissions` |
| GET | `/api/v1/audit/records` |
| POST | `/api/v1/audit/flush` |
| GET | `/api/v1/audit/query` |
| GET | `/api/v1/audit/query/subject-touches` |

## Runtime (harness bearer; exempt from the service credential)

| Method | Route |
|--------|-------|
| GET | `/api/v1/runtime/whoami` |
| GET | `/api/v1/runtime/agents` |
| POST | `/api/v1/runtime/heartbeat` |
| GET | `/api/v1/runtime/credential-bindings/{user_id}/{service}` |
| PUT | `/api/v1/runtime/credential-sync-keys` |
| GET | `/api/v1/runtime/model-profiles/{profile_id}` |
| POST | `/api/v1/runtime/credential-delivery/claim` |
| POST | `/api/v1/runtime/credential-delivery/ack` |

## Internal (web-proxy driven)

| Method | Route |
|--------|-------|
| POST | `/api/v1/internal/harness-identity` |
| POST | `/api/v1/internal/cli-device-authorizations` |
| POST | `/api/v1/internal/cli-device-authorizations/poll` |
| POST | `/api/v1/internal/cli-device-authorizations/approve` |
| POST | `/api/v1/internal/runtime-installations` |
| GET | `/api/v1/internal/runtime-installations/{id}` |
| GET | `/api/v1/internal/runtime-installations/{id}/agents` |
| POST | `/api/v1/internal/runtime-installations/{id}/agents` |
| DELETE | `/api/v1/internal/runtime-installations/{id}/agents/{agent_id}` |
| POST | `/api/v1/internal/runtime-installations/{id}/credential` |
| POST | `/api/v1/internal/runtime-installations/{id}/deployment` |
| POST | `/api/v1/internal/runtime-installations/{id}/{action:bind\|disable\|revoke}` |
| POST | `/api/v1/internal/runtime-installations/{id}/rotate` |
