# Azure portal setup for Kei directory sync

For the customer's Entra admin. The source of truth is `docs/entra-sync.md` in
the `kei-oidc-bridge` repository. Examples use a neutral tenant: Contoso, with
a chat app registration called `contoso-chat`.

## 1. App roles on the app users sign in to

On the app registration your users sign in to (here `contoso-chat`):

1. **App registrations → `contoso-chat` → App roles → Create app role**, one
   per Kei group:
   - display name `Pilot`, allowed member types **Users/Groups**, value
     **`pilot`**, enabled;
   - repeat for `dev`, and so on.

   The **value** is the Kei group name, exactly and case-sensitive. The display
   name is only used in the group's description
   (`Synced from Entra app role: Pilot`).
2. **Enterprise applications → `contoso-chat` → Users and groups.** Assign each
   Entra group to its role (`Pilot`, `Dev`). Remove any **Default Access**
   assignment of those groups.

### Why Default Access is ignored

An assignment made with no app role (role **Default Access**) has the all-zero
app role id `00000000-0000-0000-0000-000000000000`. It has no value to name a
Kei group after, so the sync skips it entirely: no group, no members, no users,
not counted in `assignments`. The report counts it as `default_access_skipped`.

### Membership rules

- A user assigned to a role directly, or a **direct** member of a group
  assigned to it, is added to the role's Kei group.
- Members of nested groups are not added.
- Don't rename a role's value later: existing assignments keep feeding the old
  Kei group, and new assignments create a group with the new name. Add a new
  role instead.

## 2. The sync app registration

1. **App registrations → New registration**, e.g. `Kei Entra sync`, single
   tenant.
2. **API permissions → Add a permission → Microsoft Graph → Application
   permissions** (not delegated), all three:

   | Permission | Why |
   | --- | --- |
   | `Application.Read.All` | Read the chat app's service principal, its `appRoles`, and who is assigned to them (`appRoleAssignedTo`) |
   | `GroupMember.Read.All` | Read each assigned group and its direct members |
   | `User.Read.All` | Read `mail`, `userPrincipalName`, `displayName`, `givenName`, `accountEnabled` and `userType` of users to create |

3. **Grant admin consent** for the tenant. Application permissions need it; the
   sync gets 403 from Graph without it.

## 3. The federated credential (no secret)

Kei signs in to Entra with a federated credential: Haikei's cluster gives the
sync a short-lived, automatically rotated service-account token, and the sync
app trusts that token for exactly one service account. There is no secret to
create, send or rotate.

1. On `Kei Entra sync`: **Certificates & secrets → Federated credentials → Add
   credential.**
2. Scenario **Kubernetes accessing Azure resources** (or **Other issuer**).
3. Enter:

   | Field | Value |
   | --- | --- |
   | Cluster issuer URL | `https://oidc.eks.us-east-1.amazonaws.com/id/7AD200EBD688652018CBF106B042AD88` |
   | Namespace | `kei` |
   | Service account | `oidc-bridge` |
   | Subject identifier (result) | `system:serviceaccount:kei:oidc-bridge` |
   | Audience | `api://AzureADTokenExchange` (the default) |
   | Name | anything, e.g. `kei-oidc-bridge` |

   With **Other issuer**, enter the issuer, the subject and the audience
   directly. Values must match exactly: no trailing slash, no spaces.
4. **Don't create a client secret.** Kei has no client-secret option.

The issuer is Haikei's cluster issuer as published in the runbook. If Haikei
ever changes the issuer or the service account, every customer's federated
credential has to change too, and Haikei will say so.

## 4. The three ids

None of them is secret.

| Id | Where | `kei directory-sync set` flag |
| --- | --- | --- |
| Directory (tenant) id | Overview of either app registration | `--tenant-id` |
| Application (client) id of the **sync** app | Overview of `Kei Entra sync` | `--client-id` |
| Application (client) id of the **app with the roles** | Overview of `contoso-chat` | `--app-id` |

`--client-id` is the app with the federated credential. `--app-id` is the app
with the app roles. Swapping them gives a token error (wrong client) or
`service principal for app … not found` (wrong app).

## Reading Entra's side of a token failure

The run report shows only a short error such as
`token: entra returned 401 invalid_client`; it never copies Entra's response
body. For the detailed `AADSTS…` code, an Entra admin opens **Entra ID →
Monitoring → Sign-in logs → Service principal sign-ins** and filters on the
sync app. A "no matching federated identity record" error there means the
issuer, subject or audience on the federated credential doesn't match what the
sync presents.
