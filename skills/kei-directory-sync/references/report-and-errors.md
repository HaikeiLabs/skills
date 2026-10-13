# Run reports and error strings

Source of truth: `docs/entra-sync.md` in the `kei-oidc-bridge` repository and
`internal/app/directory_sync.go` in the `kei-cli` repository.

## Commands

| Command | Shows |
| --- | --- |
| `kei directory-sync report` | The newest run in full: times, `result`, `dry_run`, `error`, every stat, and the changes (headed `changes (dry run; not applied):` in a dry run) |
| `kei directory-sync report --limit N` | The last N runs as a table: `START_TIME RESULT DRY_RUN GROUPS_CREATED MEMBERS_ADDED REVOKED USERS_CREATED WOULD_CREATE ERROR` |
| `kei directory-sync report --json` | The raw runs page |
| `kei directory-sync get` | Settings and a `last_run` summary; `No directory sync configured.` and exit 1 when none |

`report` prints `No runs yet.` before the first run. Kei keeps the newest 100
runs per org.

## Run fields

| Field | Meaning |
| --- | --- |
| `start_time`, `end_time` | When the run started and ended |
| `dry_run` | The **effective** dry run: `true` if Haikei's platform ceiling or the org's own setting says so |
| `result` | `succeeded` or `failed` |
| `error` | Why it failed; empty on success. Never contains tokens or Graph bodies |
| `stats` | Counts, below |
| `changes` | `{action, target}` pairs: what was done or, in dry run, would be done. At most 500; `changes_truncated: true` beyond that |

## Stats

In a dry run these are what the run *would* do.

| Stat | Meaning |
| --- | --- |
| `assignments` | User and group assignments on a defined app role |
| `default_access_skipped` | Default Access assignments ignored |
| `groups_created` | Kei groups created |
| `users_created` | Kei users created |
| `would_create` | Kei users a dry run would create |
| `users_skipped_disabled` | Not created: disabled in Entra (or `accountEnabled` missing) |
| `users_skipped_guest` | Not created: `userType=Guest` |
| `org_members_added` | Created users added to the org as `member` |
| `members_added` | Group memberships added |
| `unknown_users` | Assigned users with no Kei user who were not created (usually `create_users` is off) |
| `member_errors` | Failed writes, retried next run |
| `memberships_revoked` | Sync-added memberships removed (revocation on) |
| `stale_removed` | Assignments that no longer exist in Entra |

## Change actions

```json
{"action": "create_group", "target": "pilot"}
{"action": "create_user",  "target": "ana@contoso.example"}
{"action": "add_member",   "target": "pilot ← ana@contoso.example"}
```

## Error strings

| `error` contains | Meaning | Fix |
| --- | --- | --- |
| `token: entra returned 400 …` / `token: entra returned 401 invalid_client` | Entra rejected the federated sign-in | Check the federated credential's issuer, subject `system:serviceaccount:kei:oidc-bridge`, audience `api://AzureADTokenExchange`; check `--client-id` (sync app) and `--tenant-id`. Entra's sign-in logs show the `AADSTS…` code |
| `token: read federated token file` / `federated token file is empty` | Haikei-side: the sync's projected token is missing | Ask Haikei |
| `graph: … status 403` | Graph permission missing, delegated, or not consented | Three **application** permissions plus admin consent |
| `service principal for app <id> not found in tenant <id>` | `--app-id` is not an app in this tenant | Set `--app-id` to the app with the roles |
| `graph: … graph: not found` | Graph returned 404: wrong `--app-id`, or an assigned group or user was deleted | Check `--app-id` and the assignments |
| `creation cap exceeded: N users would be created (max M, …)` | More new users than the platform cap (200 by default). Nothing written; applies in dry run too | Check assignments; ask Haikei to raise the cap or roll out in batches |
| `removal cap exceeded: …` / `revocation cap exceeded: …` | Would drop more than the allowed share (20% by default). Nothing written | Check assignments; ask Haikei |
| `tenant already synced by org …` | Another org syncs this tenant | One org per tenant; use that org |

## CLI-side errors

| Output | Meaning |
| --- | --- |
| `directory-sync set: ALREADY_EXISTS: tenant_id is already used by another organization's directory sync (HTTP 409)` | The tenant id belongs to another Kei org |
| `directory-sync set: … (HTTP 400)` | An id isn't a GUID, or `enable` without all three ids |
| `… (HTTP 403)` | The login isn't an owner or admin of the org |
| `… (HTTP 404)` on `set` (or `report`) | The console proxy doesn't allow the directory-sync routes yet. A first `set` creates the config, so this is never "not configured". Ask Haikei |
| `No directory sync configured.` from `get` | Usually no `set` yet; if `set` also 404s, it's the proxy (above) |
| `directory-sync set requires at least one of --tenant-id, …` (exit 2) | `set` with no flags |
| `unknown directory-sync command "--help"` | Not a help command; use `kei help` or `kei directory-sync set --help` |
