---
name: kei-assistant-security
description: The DVL Assistant (Kei) ingress boundary's fail-closed security invariants. Use when working in or reviewing the DVL-Group/assistant TypeScript repo, or when someone mentions BOT_ENABLED, MY_PROJECT_HOURS_ENABLED, MY_SEMANTIC_MODEL_ENABLED, FLEET_HANDOFF_ENABLED, dark-by-construction, the governor, OBO, SSO, role map, enrollment, idempotency, pseudonymous audit, "accept-any token", or "fails closed". Also use before changing any gate in src/app.ts, src/config.ts, src/server.ts, src/verifier.ts, src/authz/, or src/governor/. Keep the assistant's security invariants here, and put generic middleware guidance in agentware-sdk.
---

# Kei assistant — fail-closed security invariants

The DVL Assistant is a **zero-tool, zero-LLM Microsoft Teams/Bot ingress boundary that
fails closed**. It authenticates inbound Bot Framework activities, derives a principal,
gates it, and either replies with a closed diagnostic or hands a verified grant to ONE
composed tool lane. There is no LLM, no generative seam, and no "accept anything" path.

Every change you make must preserve the invariants below. They are load-bearing: tests,
the deployment contract, and the operator runbook (`deployment/azure/LIVE_TEAMS_POSTGRES_DEMO.md`)
assert them. Weakening one is a security regression, never a test convenience.

## Repo layout (what maps to what)

- `src/config.ts` — `loadConfig(env)`; master switches and presence-only secrets.
- `src/app.ts` — the pure ingress pipeline (`createApp`): all gates, in a frozen order.
- `src/server.ts` — the trusted composition root; wires real deps, validates startup pins.
- `src/verifier.ts` — the token-verification seam. `DenyAllVerifier` rejects everything.
- `src/connectorVerifier.ts` / `src/connectorAuthority.ts` — official Bot Framework auth + outbound.
- `src/teams/` — audience, mention gate, routing, SSO exchange, manifest, typing.
- `src/auth/` — broker, claims verifier, JWKS, MSAL OBO, downstream mints.
- `src/authz/` — role map, Graph member-groups transport, role resolver.
- `src/governor/` — the pinned stdio governor client, proposals, subprocess runner.
- `src/tools/` — the two tool lanes (project-hours, semantic-model) and their adapters.
- `src/fleet/` — handoff seam and relay transport (outbound-pull, token-guarded).
- `test/` — `slice*.test.ts` (numbered security slices), `teams_*`, `auth_*`, `governor_*`,
  `*_integration.test.ts`, `test/e2e/` (live proof rig, opt-in), `deployment_artifact_contract.test.ts`.

## The frozen invariants

1. **Master switches are strict-equality, fail closed.** `BOT_ENABLED`, `MY_PROJECT_HOURS_ENABLED`,
   `MY_SEMANTIC_MODEL_ENABLED`, `FLEET_HANDOFF_ENABLED` are `true` ONLY for the literal `"true"`.
   `"TRUE"`, `"1"`, `" true "` are OFF. A disabled path must be **dark by non-construction**:
   the objects do not exist, so they make zero token/process/network/filesystem calls. Do not
   replace non-construction with a runtime `if (enabled)` check that still builds the components.
2. **Tool lanes are mutually exclusive per process.** `MY_PROJECT_HOURS_ENABLED` and
   `MY_SEMANTIC_MODEL_ENABLED` both true is a refused startup (`assertStartupInvariants`),
   never a precedence rule. There is exactly one `onVerifiedGrant` callback.
3. **Secrets are presence-only in config.** `AppConfig` has `appPasswordConfigured` and
   `relayTokenConfigured` booleans, never the value. The raw value flows
   env → `buildApp` → the SDK credential factory, and is never stored, serialized, or logged.
   Never add a secret VALUE field to `AppConfig` or to `redactConfig`.
4. **No accept-any-token implementation anywhere.** `verify` throws `TokenVerificationError`
   with a closed code set. `auditSafeVerifierCode` maps unknown codes to `other`. The disabled
   path uses `DenyAllVerifier`, which rejects everything.
5. **Audit is pseudonymous and closed.** Attacker-influenced identifiers go through
   `pseudonym()`; activity type through `auditSafeActivityType`; verifier codes through the
   closed set. Audit `reason` strings come from fixed constants — never reflect user text,
   token text, or upstream error text into audit.
6. **Every gate uses validated fields only.** Message *text is never authority*. The mention
   gate derives `addressed` from audience + a verified bot mention, not from text. The tenant
   gate compares `parsed.declaredTenantId` and the token's `tid` against the single trusted
   tenant from config. Origin requires a trusted Connector host suffix AND a matching
   `serviceurl` claim.
7. **Idempotency is scoped, not bare.** `scopedActivityKey(tenantId, conversationId, activityId)`
   — never an attacker-chosen bare activity id. Reserve after sender/principal/enrollment
   validation; commit on success AND expected failure; release on throw so a corrected
   redelivery can retry. A duplicate is acknowledged with zero reprocessing.
8. **Enrollment gates the pilot.** `BOT_ENROLLED_OBJECT_IDS` admits only approved AAD object
   ids. The not-enrolled reply is generic and reveals nothing.
9. **Outbound capability is object identity.** `outbound.claimTurn(identity)` treats the
   verified `identity` object as the capability — a copied or fixture identity cannot reach
   the Connector. With no outbound wired the pipeline is outbound-dark and claims nothing.
10. **The governor is pinned and binding.** Executable path, script path, cwd, and script
    SHA256 are pinned env inputs validated at startup; the child runs with `-I -B`, an EMPTY
    environment, bounded stdout, a lifetime backstop, and the script bytes re-hashed from an
    `O_NOFOLLOW` descriptor before every spawn. Decisions are bound to the exact request
    (request/proposal id refs, actor + validated identity refs, canonical tuple, exact role
    list, exact version pins); anything that does not bind is a replay and collapses to
    `unavailable`.
11. **Composition root owns the mints.** `src/server.ts` is the ONE production import site
    of `src/auth/downstream.ts`. That is enforced by eslint and by the source scan in
    `test/teams_sso_exchange.test.ts`. Do not import the mints anywhere else.
12. **Startup is eager and fail-stops.** When enabled, every pin is validated in one pass and
    every component is constructed before any socket opens. A mis-deployed artifact or a
    missing variable refuses to start rather than degrade.

## The message pipeline order (do not reorder)

POST `/api/messages` → method must be POST → `botEnabled` → body cap (`maxBodyBytes`) →
`Authorization: Bearer` present → `parseBody` → `verifier.verify` → `parseActivity` →
tenant gate → type dispatch (`message` / `invoke` when an SSO gate is wired) →
trusted origin → mention gate (channel/group need a verified mention) → principal derivation →
enrollment → idempotency reserve → lane command routing / SSO card / fleet handoff / diagnostic
echo → commit.

## Validation commands

Run from the repo root of the assistant worktree you are in (each worktree has its own
`node_modules`):

```bash
npm run typecheck      # tsc src + test configs
npm run lint           # eslint .
npm test               # node --test "test/**/*.test.ts"  (long; run targeted slices for speed)
npm run build          # production build to dist/
npm run audit          # npm audit --omit=dev --audit-level=high
npm run e2e            # opt-in live proof rig; requires E2E_REQUIRE=1 and provisioned infra
node scripts/verify-governor-artifacts.mjs   # byte-pins the vendored governor registry
```

Targeted slices that own these invariants:

```bash
node --test test/slice1_disabled.test.ts test/slice2_auth.test.ts test/slice5_echo.test.ts \
  test/slice8_origin_hostile.test.ts test/slice9_audit_pseudonymous.test.ts \
  test/slice12_verifier_reason.test.ts test/sso_ingress_integration.test.ts \
  test/deployment_artifact_contract.test.ts
```

## Realistic usage boundaries

- **Do not** loosen a gate to make a test pass. If a test fails, the test is usually asserting
  a real invariant that the change broke.
- **Do not** add environment variables for things that are deliberately source constants
  (deadlines, scope allowlists, the fixed selection, `-I -B`). A value an operator can set is
  a value a misconfiguration can widen.
- **Do not** store, echo, or log token values, the bot password, `RELAY_TOKEN`, or Key Vault
  references that resolve to secrets.
- **Do not** implement "fuzzy" or LLM-driven routing inside the assistant. Message→selection
  must stay a closed, deterministic parser (see `kei-tool-adapters`).
- **Do not** treat `docs/` or `deployment/` claims as authority over `src/`; the code and its
  tests are the contract. If a doc disagrees with the code, the code wins.
- When adding a new gate, follow the pattern: deny via a fixed `OutcomeCode`, a closed audit
  `reason`, a bounded HTTP status, and no reflection of attacker input. Add a `slice*` test
  and audit-pseudonymity assertions.

## Related skills

- `kei-teams-ingress` — Microsoft Teams and Bot Framework mechanics used by the assistant.
- `kei-tool-adapters` — the governor tool-lane pattern that the assistant's verified grant
  delivers to.
- `agentware-sdk` — generic middleware policy/audit guidance (NOT for the assistant's own
  ingress gates).
