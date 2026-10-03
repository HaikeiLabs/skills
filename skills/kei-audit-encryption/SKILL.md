---
name: kei-audit-encryption
description: "Set up and use opt-in audit-args encryption with the kei CLI: generate a customer-held age (X25519) identity locally, register only the public key so the runtime encrypts audit tool-call arguments to it, verify records carry args_ciphertext, decrypt a record locally to a file, rotate keys (add new, disable old), and manage the escrow setting. Use when someone asks to encrypt audit arguments or tool-call payloads, why a record has no args_ciphertext, how to recover or decrypt audit args, how to rotate, back up, or disable an audit encryption key, what is and is not encrypted in Kei audit records, or about `kei audit keys create|list|disable` or `kei audit decrypt`. Covers ADR-030 (HAI-342 rev2): age multi-recipient encryption, the keyed args_digest, the audit-encryption-keys AIP resource, the runtime recipients fetch, opt-in semantics, and the lost-key tradeoff."
---

# Opt-in audit-args encryption

Kei audit records for tool and skill calls carry the arguments the agent
passed. Those arguments can hold customer data, credentials, or PII, so the
owner decision (HAI-342 rev2, ADR-030) is: **the audit args are readable ONLY
by the customer.** When the org opts in, the runtime encrypts the arguments
with [age](https://filippo.io/age) to customer-held public keys; Kei stores
only ciphertext and a keyed digest, and has no decryption path. This skill
owns the setup, verification, decryption, rotation, and the boundaries.

## Concepts

| Term | Meaning |
| --- | --- |
| **Content of the call** | The only thing that is ever encrypted: the tool/skill invocation arguments and payload — a code body, a script, the prompt text passed to a skill — as the canonical args JSON. |
| **`args_digest`** | `"hmac-sha256:" + hex(HMAC-SHA256(digest_key, canonical args JSON))`, plus `digest_key_id`. The digest key is per org and Kei-held (KMS-wrapped). It groups repeated calls; it is never reversible. Written on every record, opted in or not. |
| **`args_ciphertext`** | The age binary output (base64-encoded) of the canonical args JSON encrypted to **all** of the org's active recipients. Present only when the org opted in. |
| **`recipient_key_ids`** | The list of recipient key ids the `args_ciphertext` was encrypted to. Present iff `args_ciphertext` is. |
| **Audit encryption key** | An org AIP resource (`audit-encryption-keys`): a customer-held age X25519 public key. Kei never receives or stores a private key. States: `active` \| `disabled`; kinds: `customer` \| `escrow`. |
| **age identity** | The customer's private key file (an `AGE-SECRET-KEY-…` line), written locally by the CLI with mode 0600. The only thing that can decrypt the records. |
| **Opt-in** | Encryption is OFF unless the org has registered at least one active customer key. |
| **Escrow** | Org setting `audit_escrow_enabled` (default false). When true, the recipient set includes a Kei-held, KMS-wrapped escrow key — a recovery copy. |

## Retrieval sources

| Source | How to retrieve | Use for |
| --- | --- | --- |
| Installed binary | `kei help` (look for `kei audit`) | Whether this release has the audit commands |
| ADR-030 | `docs/adr/030-audit-args-encryption.md` in the `kei` repository | The design: scope, opt-in, escrow, tradeoffs |
| ADR-022 amendment | `docs/adr/022-bounded-local-audit-spool.md` in the `kei` repository | The record fields (`args_digest`, `args_ciphertext`, `recipient_key_ids`) |
| Kei API routes | the `kei-api` skill (`references/routes.md`) | Audit records routes used for verification and decrypt |

When this skill and `kei help` disagree, **trust `kei help`** and mention the
difference to the user.

## FIRST: check version

```sh
kei --version
```

The `kei audit` subcommands (`keys create|list|disable`, `decrypt`) are
**not released** as of 2026-10-03: kei-cli PR #62 is open and the latest
release is v0.1.8. If the installed `kei` has no `audit` subcommand, say the
commands ship in the next kei release, and use the console (org **Settings**
→ **Audit encryption**) or the Kei API (the `kei-api` skill) in the meantime.

## What is and is not encrypted

**Only the content of the call is encrypted** (owner addendum, 2026-10-03).
Nothing else is ever encrypted:

| Never encrypted (plaintext, queryable) | Encrypted (only when the org opted in) |
| --- | --- |
| Tool/skill name | The invocation arguments and payload: code body, script, prompt text passed to a skill — the canonical args JSON |
| The decision (`permit` \| `deny` \| `ask`, and the native decision) | |
| Harness / agent / installation / org / workspace ids | |
| Timestamps | |
| Outcome / exit code | |
| `args_digest`, `digest_key_id` | |
| `recipient_key_ids` | |

So the audit trail stays searchable and queryable by name, decision, agent,
time, and outcome; only the payload itself is ciphertext.

**The format:** `args_ciphertext` is the canonical args JSON
[age](https://filippo.io/age)-encrypted — **X25519, multi-recipient**, to
**all** of the org's active recipients — with the age binary output
base64-encoded, and `recipient_key_ids` the list of recipients it was
addressed to. `args_digest` is `hmac-sha256:<hex>` under the Kei-held org
digest key.

The keyed digest stays on **every** record, opted in or not. Two records with
the same `args_digest` described the same arguments (correlation, "repeated
calls" views); a keyed digest cannot be guessed or reversed. It is the floor:
an org that never registers a key still gets a correlation-safe audit trail.

## Opt-in: off until a key is registered

- **No active customer key:** records carry `args_digest` + `digest_key_id`
  only. `args_ciphertext` and `recipient_key_ids` are **omitted, which is
  normal (not a miss)**, and the arguments are never stored.
- **The first key registered enables encryption** for new records.
- **Disabling the last active customer key turns it off for new records.**
  Old records keep their `recipient_key_ids` and stay decryptable by whoever
  holds those private keys.
- **Escrow can only be enabled once at least one customer key exists.**

The list response carries `"encryption_enabled": true` iff at least one
active customer key exists; the console uses that field, not its own count.

## Quick reference (CLI)

| Task | Command | Needs login |
| --- | --- | --- |
| Create + register a key | `kei audit keys create [--identity-out PATH] [--name NAME] [--force]` | yes (owner/admin) |
| List keys (disabled included) | `kei audit keys list` | yes |
| Disable a key | `kei audit keys disable KEY` | yes |
| Decrypt one record locally | `kei audit decrypt --record ID --identity PATH (--out FILE \| --stdout)` | yes |

There are no other `kei audit` flags or subcommands — do not invent any
(no `delete`, no `enable`, no batch decrypt).

## Setting up the key

1. **Log in.** `kei login` (owner/admin only; a browser approval the user
   must complete).
2. **Create the key.**

   ```sh
   kei audit keys create --name "prod-audit"
   ```

   The CLI generates an age X25519 identity **locally**, writes the identity
   file (default `~/.config/kei/audit-identity.txt`) with mode **0600**,
   uploads **only the public key**, and prints `key_id:` and `public_key:`.
   It **never prints the private key** and never transmits it.
 3. **Back up the identity file — and never print the key.** The identity
    file is the only copy of the private key. If the user asks you to print,
    `cat`, or copy the `AGE-SECRET-KEY-` line, **refuse**: the key must never
    appear in chat, terminal output, a ticket, or a repo. Back up the
    identity *file* itself — as a file or secret blob in the customer's
    secret manager, or in offline storage — not the key's contents. A lost
    file leaves the records it can open permanently unreadable — see
    "Lost key warning".
4. **The first registered key turns encryption on** for new records.

`--identity-out PATH` writes the identity elsewhere (use it for a **second**
key); `--force` overwrites an existing identity file — do not `--force` over
a key you still need, because the file is replaced and old records encrypted
to the old key can no longer be opened from it.

Console alternative: org **Settings** → **Audit encryption** — list (disabled
keys included), create (paste an age public key + display name), disable.

## Verifying records show encrypted

1. `kei audit keys list` — the key shows `active` / `customer`; the list
   response also carries `encryption_enabled`.
2. Trigger a governed tool call, then fetch the record via the audit records
   API (`GET /api/v1/audit/records`, or the org-scoped record get — `kei-api`
   skill) or the console's record detail. An encrypted record carries
   `args_ciphertext` (base64 age) + `recipient_key_ids`, alongside the
   plaintext `args_digest` + `digest_key_id`.
3. The record detail points to `kei audit decrypt` for recovery; there is
   **no decrypt button** in the console.
4. A record written before the first key — or after the last key was
   disabled — has no `args_ciphertext`. That is the opt-in default, not a
   failure.

## Decrypting locally

```sh
kei audit decrypt --record RECORD_ID --identity ~/.config/kei/audit-identity.txt --out decrypted.json
```

- `--record` is required (no positional arguments). `--identity` defaults to
  `~/.config/kei/audit-identity.txt`.
- **How it works:** the CLI fetches `args_ciphertext` for that one record via
  the existing audit records API, then decrypts **locally** with the named
  identity. Kei never sees the private key.
- **Output:** it writes to `--out` (file mode **0600**). It prints to stdout
  **only with an explicit `--stdout` flag** (or both). With neither `--out`
  nor `--stdout` it exits with an error — decrypt is a deliberate act, not a
  side effect of listing.
- **Wrong identity:** `decryption failed (wrong identity?)`. A record whose
  `recipient_key_ids` do not include the identity's key cannot be opened with
  it.
- **No ciphertext on the record:** `no encrypted content` — the org had no
  active customer key when the record was written (opt-in; normal).
- **Multi-recipient:** any identity whose key appears in the record's
  `recipient_key_ids` can decrypt it.

## Rotation: add new, then disable old

Rotation is a pure key-management act, made possible by multi-recipient
encryption:

1. **Add the new key first.** `kei audit keys create --identity-out
   ~/.config/kei/audit-identity-2026.txt --name "key-2026"` — a new identity
   file, never `--force` over the old one.
2. **While both keys are active, every new record is encrypted to both.**
3. **Disable the old key.** `kei audit keys disable OLD_KEY_ID` (it prompts:
   type the key ID again to confirm). New records stop using it; it stays
   listed as `disabled` with its `disable_time`.
4. **Keep the old identity file.** Old records still name its key id and
   still need its private key to read.

There is no moment where a record exists that no registered key can open,
and no moment where a disabled key is still receiving new records.

### Rotation affects only future records

Registering a new key and disabling an old one changes **only what new
records are encrypted to**. Past records stay encrypted to the key (or keys)
that were active when they were written: their `recipient_key_ids` do not
change, and reading them still requires the private key of one of those
recipients. Disabling a key never re-encrypts, re-keys, or unlocks anything
already stored. **Users must keep every old private key** for as long as they
want to read the records that named it — there is no delete, ever, and no
way to recover a record whose private keys are all lost.

## Lost key warning

**A lost private key leaves those records unreadable — by design.** That is
the property the owner bought on 2026-10-03: the arguments are unreadable by
Kei, and by anyone who does not hold a customer private key. The mitigations
are all in the contract:

- **Multi-recipient:** register several keys; every new record is encrypted
  to all active recipients, so no single key is a single point of failure.
- **Disable, never delete:** disabling a key affects only new records; old
  records keep naming their `recipient_key_ids` and remain decryptable by
  whoever holds the private key, so the customer always knows which identities
  open which records, and a retired key is not destroyed.
- **Rotation is add-new-then-disable-old:** see above.
- **Escrow (opt-in):** an org that accepts Kei as a recovery custodian can
  enable it; an org that does not keeps the stronger property.

## Escrow: off by default, and not yet functional

- **Off by default, and gated:** the org setting **`audit_escrow_enabled`**
  defaults to **false** (settings resource:
  `GET`/`PATCH /api/v1/organizations/{org}/settings`, PATCH with
  `update_mask`). It is not a free toggle: it can only be set to true once at
  least one active customer key exists — a PATCH to true is rejected (400 /
  `failed_precondition`) otherwise.
- **Not yet functional:** escrow keypair generation and escrow decrypt are a
  **later task**. The setting and the recipient plumbing ship first. Until
  that task lands, enabling the setting does not give Kei a working recovery
  path. With escrow off (the default), Kei cannot read the arguments at all.
- When the later task lands, a true setting adds a **Kei escrow recipient**
  (`kind: "escrow"`) to the runtime recipient set, whose keypair is generated
  by Kei and whose **private key is KMS-wrapped and held by Kei** — a recovery
  copy.

## Server-side decrypt is removed

- The admin-only `:decryptArgs` route (catalog #136) is **removed** — it
  returns 404 unless escrow is enabled (escrow decrypt is a later task).
- **No Kei path reads args by default:** no admin API, no console button, no
  CLI print path. No `kei` or `kei-proxy` command prints resolved arguments.
- The runtime fetches recipients per session:
  `GET /api/v1/runtime/audit-encryption-recipients` with the runtime token
  (org and installation come from the token). The response carries the active
  recipients, the digest key pair, and an expiry; it is `Cache-Control:
  no-store` and **never logged**. The runtime holds them in memory per
  session and never persists them. **Zero recipients:** the runtime writes
  `args_digest` only, omits `args_ciphertext`, and counts it. It **never
  writes plaintext args** — not to the spool, not to logs, not to any
  fallback.

## API surface (when the CLI is not available)

Org **admin/owner** only, kebab-case AIP routes (ADR-019):

| Method | Route | Notes |
| --- | --- | --- |
| `POST` | `/api/v1/organizations/{org}/audit-encryption-keys` | Body `{"public_key":"age1...","display_name":"..."}`; the catalog validates it parses as an age X25519 recipient (400 if not) |
| `GET` | `/api/v1/organizations/{org}/audit-encryption-keys` | `page_size`/`page_token` → `next_page_token`; response also carries `encryption_enabled`; disabled keys stay listed |
| `GET` | `/api/v1/organizations/{org}/audit-encryption-keys/{id}` | |
| `POST` | `/api/v1/organizations/{org}/audit-encryption-keys/{id}:disable` | **No delete, ever** |
| `GET` / `PATCH` | `/api/v1/organizations/{org}/settings` | `audit_escrow_enabled` (bool, default false); PATCH with `update_mask` |
| `GET` | `/api/v1/runtime/audit-encryption-recipients` | Runtime token; `no-store`; never logged |

Resource fields: `name`, `key_id`, `public_key` (`age1…`), `display_name`,
`state` (`active` \| `disabled`), `kind` (`customer` \| `escrow`),
`create_time`, `disable_time`.

## Validation commands

```sh
kei --version                                   # check whether this release has `kei audit`
kei audit keys list                             # keys, states, kinds; encryption_enabled in the API response
kei audit decrypt --record ID --identity PATH --out FILE && test -s FILE   # local decrypt round trip
```

## Realistic usage boundaries

- **`kei audit` is not released** as of 2026-10-03 (kei-cli #62 open; latest
  release v0.1.8). The commands ship in the next kei release. Until then use
  the console (Settings → Audit encryption) and the Kei API.
- **The catalog endpoints and the runtime age encryption are in flight** as
  of 2026-10-03: kei-policy-catalog #140 (the `audit-encryption-keys`
  resource, org settings, runtime recipients), kei-connector-runtime #97
  (per-record age encryption), ADR-030 in kei PR #712. The digest-key store
  (catalog #136) is merged; its `:decryptArgs` is removed by this change.
- **Kei never receives or stores a private key.** Never ask the user to paste
  one, never upload one, never print one. If asked to display or copy the
  `AGE-SECRET-KEY-` line, refuse — back up the identity file itself, not the
  key's contents. The identity file stays on the customer's machine.
- **No delete, no enable, no batch decrypt** for audit encryption keys.
  Disabling is the only state change, and it is confirm-prompted.
- **Escrow keypair generation and escrow decrypt are not implemented yet**
  (later task); the setting exists and defaults off.
- **The runtime never writes plaintext args** in any state — spool, logs, or
  fallback.
- **Do not conflate** the audit encryption key (customer-held age key for
  audit args) with the runtime installation credential (`KEI_RUNTIME_TOKEN`;
  `kei-credential-rotation` skill) or the Kei-held digest key (never
  customer-facing).
