# Set up a Linear connector

A Linear connector lets agents in a Kei workspace read Linear teams,
projects, cycles, and issues under Kei policy. Kei holds the Linear
credential. The agent never sees it, and no step in this guide prints it.

This guide walks an owner or admin through creating the connector, connecting
a Linear account with OAuth, and copying the connector ID that a harness
needs (for example, `KEI_CONNECTOR_LINEAR_ID` for the Discord `file_bug`
tool).

> **Status, 2026-10-09.** The commands below exist in `kei` today. Two
> platform pieces are still missing, so a Linear connector cannot reach the
> **connected** state yet:
>
> - **Not available yet:** the hosted identity service has no Linear OAuth
>   app configured. Starting the Linear sign-in fails with "connector provider
>   not configured".
> - **Not available yet:** the runtime runs Linear **reads** only.
>   `issue.create` and `issue.update` are defined capabilities, but an
>   invocation is denied with `capability_not_supported`.
>
> Each step marks what is not available yet. See [Troubleshooting](#troubleshooting).

## Before you begin

- `kei` v0.1.13 or later (`kei --version`), signed in with `kei login`. Only
  an org **owner** or **admin** can sign in. A person approves the login in
  the browser.
- The workspace name or ID (`kei workspaces list`).
- For the verify step: a running `kei-proxy` for the harness that will use the
  connector (see the `kei-runtime-setup` skill).
- A Linear account that can see the teams the agent should read.

## Choose an account model

Linear connectors use OAuth. You choose whose Linear account the connector
acts as:

| Account model | Who signs in to Linear | Use it for |
| --- | --- | --- |
| `per_user` (default) | Each Kei user connects their own Linear account. A call uses the invoking user's token. | A coding harness where each person works as themselves (like the Linear MCP). |
| `shared` | An admin connects one Linear account for the whole connector. | A bot such as Pedro on Discord, where callers have no Linear account of their own. |

There is no API key to copy in either model. Linear's consent screen is the
only place a credential is created, and the token stays in Kei's identity
service.

## Option 1: OAuth, per user

This is the same experience as the Linear MCP: each person approves access in
their browser, and calls run as that person.

1. **Create the connector.**

   ```bash
   kei connectors create --workspace <workspace> --provider linear \
     --account-model per_user --name linear
   ```

   `kei` prints the connector ID:

   ```text
   Created connector linear (linear, pending).
   Connector instance ID: <connector-id>
   users connect their own accounts through their chat harness
   ```

   Copy the **Connector instance ID**. By default the connector gets Linear's
   read capabilities: `team.read`, `project.read`, `cycle.read`, `issue.read`.

2. **Each user connects their Linear account.** There is no admin step and no
   URL to share. The first time a user's harness calls the connector,
   `kei-proxy connector invoke` denies with `connector_not_connected`, and the
   response tells the harness to start the Linear sign-in. The user opens it,
   signs in to Linear, and selects **Authorize**.

   `kei connectors reconnect` does not apply to `per_user` connectors. It
   answers "users connect their own accounts through their chat harness".

   **Not available yet:** Linear sign-in needs the hosted Linear OAuth app
   (see the status note above).

3. **Check the connector.**

   ```bash
   kei connectors get <connector-id> --workspace <workspace>
   ```

   ```text
   ID:          <connector-id>
   Name:        linear
   Provider:    linear
   State:       connected (active)
   Credential:  oauth (per_user)
   Capabilities: team.read, project.read, cycle.read, issue.read
   ```

## Option 2: OAuth, shared account

Use this for a bot. An admin signs in once, and every allowed caller reads
through that account.

1. **Create the connector.**

   ```bash
   kei connectors create --workspace <workspace> --provider linear \
     --account-model shared --name linear-shared
   ```

   ```text
   Created connector linear-shared (linear, pending).
   Connector instance ID: <connector-id>
   Next, connect the shared account: kei connectors reconnect <connector-id> --workspace <workspace>
   ```

2. **Approve access in Linear.**

   ```bash
   kei connectors reconnect <connector-id> --workspace <workspace>
   ```

   `kei` prints the Linear consent URL and opens it in your browser. Add
   `--no-browser` to print it only. Sign in to the Linear account the bot
   should use and select **Authorize**. You can also select **Connect OAuth**
   on the connector in the console under **Data Connections**.

   **Not available yet:** this step fails until the hosted Linear OAuth app is
   configured.

3. **Check the connector.** Run `kei connectors get <connector-id> --workspace
   <workspace>`. **State** reads `connected (active)` and **Credential** reads
   `oauth (shared)`.

## API key (fallback)

**Not available yet.** Kei's Linear setup offers OAuth only:

- `kei connectors create --provider linear` rejects `--credential-ref` with
  "--credential-ref applies only to a provider's secret field; OAuth
  connectors have none". It never prompts for a key.
- The console offers OAuth only for Linear.
- The runtime sends the token as `Authorization: Bearer <token>`. Linear
  documents personal API keys as `Authorization: <API_KEY>`, with no
  `Bearer`.

Don't paste a Linear API key into a chat, a ticket, or a values file. If you
create one in advance, store it only in your secret manager, and don't wire it
into Kei until this path ships.

## Find a connector ID later

```bash
kei connectors list --workspace <workspace>
```

The first column is the connector ID. `kei connectors get <connector-id>
--workspace <workspace> --json` returns the full record.

## Where the connector ID goes

A connector ID is an identifier, not a secret. Kei resolves the credential
from it at call time, so the ID alone grants nothing.

For Pedro on Discord, set the Helm value in
`helm/pedro-discord/values-<env>.yaml`:

```yaml
keiProxy:
  runtime:
    linearConnectorID: "<connector-id>"
```

The chart passes it to the container as `KEI_CONNECTOR_LINEAR_ID`. When the
value is empty, `file_bug` is still authorized and audited, but Pedro replies
that bug filing is not configured and writes nothing.

**Not available yet:** `file_bug` creates an issue (`issue.create`), which the
runtime does not run today. With the ID set, the call is denied with
`capability_not_supported`.

## Verify

Run one read through the runtime. `team.read` takes a team key as the
resource:

```bash
kei-proxy connector invoke --connector <connector-id> \
  --capability team.read --action read --resource linear/team/<TEAM_KEY>
```

A success exits 0 and prints the team's `id`, `key`, and `name`. There is no
"list all teams" capability. Read one team by its key (for example
`linear/team/ENG`). The other reads use `linear/project/<id>`,
`linear/cycle/<id>`, and `linear/issue/<id>`.

For a `per_user` connector, run this from a harness whose `kei-proxy serve`
session belongs to a user who connected Linear.

## Troubleshooting

| What you see | Cause | Fix |
| --- | --- | --- |
| `connector provider not configured` when starting Linear sign-in | The hosted identity service has no Linear OAuth app. | Not available yet. Wait for the platform fix. |
| `--credential-ref applies only to a provider's secret field; OAuth connectors have none` | Linear is OAuth only. | Drop `--credential-ref`. |
| `account model "..." is not allowed for provider "linear"` | Linear accepts `per_user` and `shared` only. | Pass one of those to `--account-model`. |
| `users connect their own accounts through their chat harness` from `reconnect` | `reconnect` only applies to `shared` connectors. | Each user connects from their harness. |
| `connector_not_connected` or `connector_reconnect_required` | The calling user has not connected Linear, or the connection must be renewed. | The user signs in to Linear again from their harness. |
| `capability_not_supported` | The call is a write (`issue.create`, `issue.update`). | Not available yet. Only reads run today. |
| `capability is not declared on the connector` | The connector was created without that capability. | Recreate it with `--capabilities team.read,issue.read,...`. |
| **State** stays `pending` | The OAuth sign-in never finished. | Finish the Linear consent (`reconnect` for `shared`). |
| **State** is `needs reconnect (failed)` | The Linear token was revoked or expired. | `kei connectors reconnect <connector-id> --workspace <workspace>` for `shared`. Users reconnect from their harness for `per_user`. |

## How this compares to the Linear MCP

The Linear MCP server signs each user in with OAuth 2.1 (authorization code
with PKCE). The MCP client registers itself dynamically, so there's no client
ID to manage. Kei's `per_user` model gives the same user experience: a browser
sign-in, no key to copy, and calls that run as the user. One difference:
Kei's token stays in Kei and every call goes through Kei policy and audit.
Under the MCP, the client holds the token.
