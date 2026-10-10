---
name: kei-teams-ingress
description: Microsoft Teams and Bot Framework integration for the Kei assistant and its chat harness. Use when touching inbound Bot Framework activities, the Connector JWT verifier, SSO signin/tokenExchange invokes, OAuthCards, the mention/audience gate, reply routes, outbound Connector sends, the Teams app manifest (appPackage/manifest.template.json), messaging endpoints, or the kei-chat-harness Teams adapter (microsoft-teams-apps SDK, Bot Connector REST, TEAMS_BOT_TOKEN/TEAMS_CLIENT_ID/TEAMS_TENANT_ID). Also use for Azure Bot registration and Entra SSO configuration. Combine with kei-assistant-security for the ingress gates.
---

# Teams / Bot Framework ingress

Two codebases speak Teams here; keep them separate:

- **The Kei assistant** (`DVL-Group/assistant`) — a Node 24 ingress boundary that
  authenticates Bot Framework activities and runs the SSO/OBO tool lanes. Zero-tool by design.
- **The chat harness** (`HaikeiLabs/Kei-Chat-Harness`) — a Python bot (service `pedro_service`)
  whose `teams_main.py` uses the `microsoft-teams-apps` SDK to speak Bot Framework activities
  to Teams users.

The assistant skill `kei-assistant-security` owns the ingress gates; this skill owns the
Teams/Bot Framework mechanics on both sides.

## Bot Framework activity flow (assistant)

Inbound `POST /api/messages` body is an **activity** (JSON). The pipeline is:

1. `src/activity.ts` — `parseBody` (strict JSON) then `parseActivity` (normalizes ids,
   conversation type, declared tenant, serviceUrl). `type: "message"` is the only supported
   activity type; `invoke` reaches the closed SSO branch only when an SSO gate is wired.
2. `src/connectorVerifier.ts` — official `botframework-connector` auth: the JWT in
   `Authorization: Bearer` is validated against the expected app id (`BOT_APP_ID`) and tenant.
3. `src/teams/audience.ts` + `src/teams/gate.ts` — audience classes (`personal`, `channel`,
   `groupChat`). **Personal chat is always addressed; channel/group chat requires a verified
   bot mention** (`src/teams/mention.ts`), matched against `recipient.id`. Non-addressed
   messages are a benign `200 { outcome: 'ignored', processed: 0 }`.
4. `src/teams/routing.ts` — `buildReplyRoute(audience, parsed)` builds the in-thread reply
   route from validated ids only. It is the ONLY thing a reply can be delivered to.
5. `src/teams/typing.ts` / `src/teams/manifest.ts` — typing indicators and the manifest helpers.

### SSO (silent SSO / OAuthCard)

- `src/teams/ssoExchange.ts` — the closed `signin/tokenExchange` branch. Entered ONLY after
  the full auth chain above. Denies are the same closed `412` with three fixed fields
  (`id`, `connectionName`, `failureDetail`), so the client only ever learns "fall back to the
  card". `signin/verifyState` is acknowledged and inert.
- The OAuthCard is solicited in personal chat by `src/app.ts` (the `.14` lane composition)
  and pinned with `BOT_SSO_APPLICATION_ID_URI` as `tokenExchangeResource.uri`. `BOT_SSO_CONNECTION_NAME`
  is the connection label.
- The redeemed nonce → `src/auth/broker.ts` (OboBroker) → MSAL on-behalf-of exchange →
  the lane's downstream. `src/auth/claims.ts`, `src/auth/liveClaimsVerifier.ts` verify the
  incoming v2.0 token: audience is the **client id**, not an `api://` URI (see the
  `fix/sso-v2-audience` history).

### Outbound

- `src/connectorAuthority.ts` — mints channel tokens with the bot client secret
  (`BOT_APP_PASSWORD`, Key Vault reference) and `src/teams/routing.ts` routes in-thread
  replies via the Bot Connector REST. `claimTurn(identity)` is the one-shot capability;
  delivery is a separate closed outcome, and a send failure never changes the HTTP response.

### App manifest and registration

- `appPackage/manifest.template.json` — Teams app package; `webApplicationInfo.resource`
  must byte-match `BOT_SSO_APPLICATION_ID_URI`; bot scopes are only `personal`, `team`,
  `groupChat`. Package zip = manifest + `color.png` + `outline.png`.
- Azure Bot resource: Messaging endpoint is `https://<host>/api/messages`; the Teams channel
  must be enabled; app type must be `SingleTenant`. Bot OAuth connection must exist and match.
- The full operator contract is `deployment/azure/LIVE_TEAMS_POSTGRES_DEMO.md` (fixed demo
  scope, isolation boundaries, dark preflight, activation gate, rollback, no-go conditions).

### Teams activity types reference

| Activity type | Reached when | Handler |
|---|---|---|
| `message` (personal) | After full auth + mention gate (always addressed) | Lane guard + envelope + renderer |
| `message` (channel/groupChat) | Only if `recipient.id` matches a verified `mention.mentioned.id` | Same as personal, else `200 { outcome: 'ignored' }` |
| `invoke` — `signin/tokenExchange` | Only after full auth chain, only when SSO gate is wired | `ssoExchange.ts` → OboBroker → downstream |
| `invoke` — `signin/verifyState` | After `signin/tokenExchange` succeeded | Acknowledged and inert (`200` empty) |
| Other / unknown | Never (closed dispatch) | N/A — gate rejects before routing |

## Teams integration in the chat harness (HaikeiLabs/Kei-Chat-Harness)

- `src/pedro_service/teams_main.py` — `App(token=TEAMS_BOT_TOKEN, tenant_id=TEAMS_TENANT_ID,
  client_id=TEAMS_CLIENT_ID, client_secret=TEAMS_CLIENT_SECRET, http_server_adapter=FastAPIAdapter(...))`,
  listens on port 3001, ingress path `/teams/webhook`.
- `src/pedro_service/adapters/teams_adapter.py` — `TeamsMessageParser` reads Bot Framework
  activity fields (`id`, `text`, `from.id`, `from.name`, `timestamp`, `replyToId`); bots are
  detected by `from.id` starting with `28:`. Sends are plain `{"type":"message","text":...}`
  via httpx to `{service_url}/v3/conversations/{id}/activities`. Reactions are NOT implemented.
- Env vars: `TEAMS_BOT_TOKEN` (file fallback `TEAMS_BOT_TOKEN_PATH`), `TEAMS_TENANT_ID`,
  `TEAMS_CLIENT_ID`, `TEAMS_CLIENT_SECRET`.
- Deployment: `Dockerfile.teams` (`CMD python -m src.pedro_service.teams_main`), any
  container host; `docs/teams-deploy.md` and `docs/teams-setup.md` are the runbooks.
- This harness is an activities bot; it does NOT do OBO or adaptive cards. Keep it that way
  unless a reviewed design says otherwise.

## Validation commands

Assistant (DVL-Group/assistant):

```bash
npm run typecheck
npm run lint
node --test test/teams_gate.test.ts test/teams_mention.test.ts test/teams_routing.test.ts \
  test/teams_audience.test.ts test/teams_manifest.test.ts test/teams_sso_exchange.test.ts \
  test/teams_typing.test.ts test/sso_ingress_integration.test.ts test/auth_exchange_msal.test.ts
```

Chat harness (HaikeiLabs/Kei-Chat-Harness):

```bash
uv run ruff check src/ tests/
uv run mypy src/pedro_service
uv run pytest tests/test_teams_*.py tests/test_slack_main.py -q
# local container check
docker build -f Dockerfile.teams -t pedro-teams:latest .
```

## Realistic usage boundaries

- **Do not** fabricate activities, bearer tokens, or service URLs in tests except through the
  signed-fixture verifier (`test/support/fixtures.ts` / `test/support/entraJwt.ts`).
- **Do not** read `activity.text` as authority anywhere. Text is a payload to closed parsers,
  never a gate input.
- **Do not** widen the allowed service-host suffix list casually. A new host is a trust
  boundary change and needs a review + test (`src/config.ts` default set:
  `.botframework.com`, `.trafficmanager.net`, `.teams.microsoft.com`).
- **Do not** send anything to a route not produced by `buildReplyRoute`, and never accept a
  route from the fleet — the assistant always replies via its own route.
- SSO `412` denies must stay indistinguishable. Adding reason detail to the client body leaks
  gate internals.
- Teams does not render HTTP bodies; the in-thread card/message is the artifact. Do not
  "fix" a 200-empty-body flow by returning data in the HTTP body.

## Key env vars

| Variable | Used by | Purpose |
|---|---|---|
| `BOT_APP_ID` | Assistant | Azure Bot app registration client id |
| `BOT_APP_PASSWORD` / Key Vault ref | Assistant | Bot client secret for Connector auth |
| `BOT_SSO_APPLICATION_ID_URI` | Assistant | The `tokenExchangeResource.uri` pinned in the OAuthCard |
| `BOT_SSO_CONNECTION_NAME` | Assistant | Azure Bot OAuth connection name |
| `TEAMS_BOT_TOKEN` | Chat harness | Bot token for `microsoft-teams-apps` SDK |
| `TEAMS_CLIENT_ID` | Chat harness | Entra app client id for the harness |
| `TEAMS_TENANT_ID` | Chat harness + Assistant | Trusted tenant filter |
| `TEAMS_CLIENT_SECRET` | Chat harness | Client secret for the harness's Entra app |

## Related skills

- `kei-assistant-security` — the ingress gates that protect the Teams endpoint.
- `kei-tool-adapters` — the tool lanes that receive the verified grant from Teams SSO.
- `agentware-sdk` — generic middleware for tool-call policy and audit in the chat harness.
