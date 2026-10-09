---
name: google-drive-connector
description: Google Drive data connector — API reference, entity model, and usage patterns. Use when an agent needs to read or write Google Drive data (files, folders, documents), or when asked how to query, filter, paginate, or mutate Drive resources. Also covers Kei connector setup, including the optional drive_id field that scopes the connector to one Google shared drive. Prefer this skill over generic Google Drive knowledge.
---

# Google Drive connector — agent usage guide

Use this skill when an agent needs to interact with Google Drive through its
REST API. It covers the Lexicon (endpoints and operations), Pragmatics (how
agents use them), and Semantics (data returned and entity relationships).

There is no maintained official CLI for Google Drive that covers all
governed operations. Agents use the Google Drive API v3 directly.

## Key rules

- The agent never holds, asks for, or prints a raw credential. Kei supplies a
  Google OAuth access token at run time via `kei-proxy connector invoke`.
  Setup: an owner runs `kei connectors create --provider googledrive` (OAuth or
  service-account key); re-authorize with `kei connectors reconnect <id>`.
- Permanent file deletion is not available through the governed connector —
  files move to trash instead (trash is available and reversible).
- Resource types for Kei policy follow ADR-028: `folder` (no parent) and
  `file` (parent: folder).
- The optional `drive_id` field scopes the connector to one shared drive;
  blank means My Drive plus every shared drive the user can access. The ID is
  the last URL segment of the drive's folders URL; at OAuth consent pick the
  same Google account that can see the drive.

## Install

Agents load this skill automatically when the harness has the Haikei skills
plugin installed. See the repo README for per-harness setup.

## Connect and credentials

Kei governs every connector call. The agent never holds, asks for, or prints a
raw credential.

- **OAuth (Google Workspace):** An owner runs `kei connectors create --provider googledrive
  --workspace W`. This returns a connect URL they open in a browser to
  authorize the Google OAuth scopes. Check status with `kei connectors get <id>` and
  re-authorize with `kei connectors reconnect <id>`.
- **Service account key (shared secret):** The owner runs `kei connectors
  create --provider googledrive` (reads the JSON key without echo) or passes
  `--credential-ref <secret-manager-ref>` if the key already exists in the
  connected secret manager.
- **Repair / re-authorize:** if the connection breaks or the credential is
  rotated, re-authorize with `kei connectors reconnect <id>`.
- **At runtime:** The governed connector injects the credential via
  `kei-proxy connector invoke` (preferred) or through a `kei-proxy run`
  wrapper that sets `GOOGLE_APPLICATION_CREDENTIALS=kei://connectors/<id>/token` and
  masks the value in output. The `kei-proxy run` wrapper is pending
  [HAI-305](https://linear.app/haikei/issue/HAI-305).

## Connector setup: Drive ID

The Kei connector has an optional `drive_id` field. It scopes the connector
to ONE Google shared drive; `kei-proxy` supplies it as the drive scope on
Drive calls. Blank = the connecting user's My Drive plus every shared drive
they can access.

- **Account index:** `/u/N/` is the Google account index in that browser. At
  OAuth consent pick the same account that can see the drive, or the
  connector can't see it.
- **Find it:** open the shared drive (Google Drive left nav: **Shared
  drives**). The ID is the last URL segment:
  `https://drive.google.com/drive/u/1/folders/0AExampleSharedDrive01` →
  `0AExampleSharedDrive01`. Shared drive IDs start with `0A`; ordinary folder
  IDs usually start with `1` and are NOT drive IDs.
- **My Drive has no Drive ID:** `https://drive.google.com/drive/u/0/my-drive`
  is My Drive — leave the field blank.
- **Format:** the field accepts only `[A-Za-z0-9_-]{1,128}`. Paste only the
  ID, not the URL.

## Lexicon — endpoints and operations

### REST API v3

Base URL: `https://www.googleapis.com/drive/v3`

| Method | Endpoint | What it does | Agent notes |
| --- | --- | --- | --- |
| `GET` | `/files` | List files and folders | Query params: `q` (filter), `pageSize`, `pageToken`, `fields`, `orderBy`. Defaults to the user's My Drive. |
| `GET` | `/files/{fileId}` | Get file metadata | Returns name, mimeType, size, createdTime, modifiedTime, parents, owners. Use `fields` to limit response. |
| `GET` | `/files/{fileId}/export` | Export a Google-native file | `mimeType` param specifies target format (e.g., `text/plain`, `application/pdf`, `text/markdown`). Only for Google Docs/Sheets/Slides. |
| `GET` | `/files/{fileId}?alt=media` | Download a binary file | Direct download for non-Google-native files (PDFs, images, etc.). |
| `POST` | `/files` | Create a file or folder | Upload with `mimeType = 'application/vnd.google-apps.folder'` for folders. Supports resumable upload. |
| `PATCH` | `/files/{fileId}` | Update file metadata | Rename, move (change `parents`), modify description. |
| `POST` | `/files/{fileId}/copy` | Copy a file | Requires the source file's read permission. |
| `POST` | `/files/{fileId}/comments` | Add a comment | Body: `{"content": "..."}`. |
| `GET` | `/files/{fileId}/comments` | List comments on a file | Paginated. Includes resolved status. |
| `GET` | `/permissions/{fileId}` | List permissions on a file | Returns roles and identities. |

### Credential pass-through

This connector does **not** manage credentials. Kei supplies a Google OAuth
access token (or service account token) at run time via
`kei-proxy connector invoke`. The agent never reads or stores a token,
secret, or API key.

### Denied command surface

These actions are **not available** through the governed connector — they fall
outside the connector's scope:

| Operation | Reason |
| --- | --- |
| Permanently delete files | Not available — irreversible; moves to trash instead (trash is available) |
| Modify sharing permissions | Permission management outside connector scope |
| Admin operations (domain settings, audit logs) | Require Google Workspace admin privileges |
| Drive creation and deletion | Administrative operation |

## Pragmatics — how agents use this connector

### Common use cases

1. **Document search**: Find files by name, mimeType, or content using the
   `q` query parameter with full-text search.
2. **Read documents**: Export Google Docs to markdown or plain text for agent
   consumption; download PDFs and other binary files.
3. **Organize files**: Move files between folders, rename, copy templates.
4. **Collaboration**: Add comments to documents, read existing comments and
   suggestions.
5. **Folder traversal**: List contents of a shared drive or folder, navigate
   the hierarchy.

### Agent patterns

- Use the `q` parameter for server-side filtering. The syntax is Google's
  native query language (e.g., `name contains 'spec' and mimeType != 'application/vnd.google-apps.folder'`).
- Always request only needed fields via the `fields` parameter (e.g.,
  `files(id, name, mimeType, modifiedTime)`).
- For Google-native files (Docs/Sheets/Slides), export to a readable format
  before processing. The binary `alt=media` download does not work on them.
- Use `orderBy` to sort results (`modifiedTime desc`, `name_natural`).

### Pagination

Drive API uses `pageSize` (1–1000, default 100) and `pageToken` (received as
`nextPageToken` in the response). Continue fetching while `nextPageToken` is
non-empty.

```bash
# Pseudocode
while nextPageToken:
  GET /files?pageSize=100&pageToken={nextPageToken}
```

### Rate limits

Google Drive API quotas are per-project:
- **Read requests**: 10,000 requests per 100 seconds per user
- **Write requests**: 1,000 requests per 100 seconds per user
- **Upload requests**: 700 requests per 100 seconds per user

Check current usage from response headers: `X-RateLimit-Limit`,
`X-RateLimit-Remaining`, `X-RateLimit-Reset`.

## Semantics — data model and entity relationships

### Entity hierarchy

```
drive (My Drive or shared drive)
├── folder                  # id (UUID)
│   ├── file (Google Doc)   # id (UUID); mimeType: application/vnd.google-apps.document
│   ├── file (Google Sheet) # id (UUID); mimeType: application/vnd.google-apps.spreadsheet
│   ├── file (Google Slide) # id (UUID); mimeType: application/vnd.google-apps.presentation
│   ├── file (binary)       # id (UUID); mimeType: varies (application/pdf, image/png, etc.)
│   ├── shortcut            # id (UUID); mimeType: application/vnd.google-apps.shortcut
│   └── folder (nested)     # id (UUID); recursive
└── file                    # id (UUID)
```

### Resource types (ADR-028, for Kei policy)

Per [ADR-028](https://github.com/HaikeiLabs/kei/blob/main/docs/adr/028-policy-field-contract.md) §4, Google Drive
declares two resource types for Kei policy (each declares its parent type):
`folder` (no parent) and `file` (parent: `folder`):

| Resource type | Parent type | Canonical id example |
| --- | --- | --- |
| `folder` | — | `0B7Tk...` (UUID format) |
| `file` | `folder` | `1AbC3dE5...` (UUID format) |

### Key fields

| Entity | Field | Type | Meaning |
| --- | --- | --- | --- |
| `file` | `id` | string | Unique file/folder identifier |
| `file` | `name` | string | Display name (not unique; duplicates allowed) |
| `file` | `mimeType` | string | MIME type — determines if it's a Doc, Sheet, folder, etc. |
| `file` | `parents` | string[] | Array of parent folder IDs (typically one, may be zero for root) |
| `file` | `size` | string | File size in bytes (absent for Google-native files) |
| `file` | `createdTime` | datetime | RFC 3339 timestamp |
| `file` | `modifiedTime` | datetime | RFC 3339 timestamp |
| `file` | `owners` | object[] | List of owners (displayName, emailAddress, me) |
| `file` | `trashed` | boolean | True if file is in trash |

### Relationships

- A file has exactly one parent folder (unless it is in the root, which has
  no parent). Folders can nest arbitrarily.
- A file may be a shortcut (`.shortcut` mimeType) pointing to another file or
  folder via `shortcutDetails.targetId`.
- Google-native files (Docs, Sheets, Slides) do not have a downloadable
  `size` or `downloadUrl`; they must be exported.
- Files in shared drives have slightly different permission semantics from
  files in My Drive.
- Comments are attached to a file. Revisions are available for Google-native
  files.

## Policy entries (examples)

```yaml
# Team members can read documents in shared team folders
- effect: permit
  principal: group:team
  action: drive_read
  resource: folder:0B7Tk...
  connector: google_drive

# Only document owners can move or rename files
- effect: permit
  principal: user:user@company.com
  action: drive_write
  capability: file.write
```

## Validation commands

```bash
# Verify this skill loads correctly
node scripts/verify-skills.mjs

# Run the connector's eval suite
node scripts/run-evals.mjs --skill google-drive-connector --harness opencode \
  --model ray/deepseek-ai/DeepSeek-V4-Flash \
  --out evals-out/google-drive-connector-deepseek-$(date +%F) --jobs 2
```

## Realistic usage boundaries

- **Do not** manage credentials — Kei handles authentication via Google OAuth.
- **Do not** use `alt=media` on Google-native files (Docs/Sheets/Slides) — use
  `/export` instead with a suitable mimeType.
- **Do not** assume `name` is unique — multiple files can have the same name
  in the same folder.
- **Do not** delete files permanently — the governed connector may support
  trash (which is reversible) but not hard deletion.
- **Do not** bypass the `fields` parameter — requesting all fields on large
  file lists consumes excessive quota.
