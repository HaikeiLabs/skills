---
name: kei-openwebui
description: Set up, verify and troubleshoot Open WebUI governed by Kei with the published openwebui-kei image (Open WebUI + the in-container kei-proxy daemon + the Kei connector). Use when someone wants to run Open WebUI with Kei; create the openwebui runtime installation (`kei bot init --platform openwebui`) and deliver KEI_RUNTIME_TOKEN; grant `tool:<name>` permits for governed tools; optionally configure a model profile to pass model credentials; pull or mirror the image by digest (ECR Public, `az acr import`); run it as UID/GID 10001; set KEI_OPENWEBUI_TOOL_PACKS, KEI_PROXY_EGRESS_PROXY or WEBUI_SECRET_KEY; layer a tool pack (plain-data TOOLKITS with `tools`) and the boot tool sync; link Open WebUI users (claim link, or Entra users via kei directory-sync); or debug "tool is not registered in the policy bundle", a container that refuses to start because a pack declares no tools, `identity.unlinked`, audit rows shown "via installation", no models listed, or "left out of the manifest" warnings. Other kei commands are kei-cli; the Entra side is kei-directory-sync.
---

# Open WebUI with Kei (openwebui-kei)

`openwebui-kei` is one container: Open WebUI, the **kei-proxy daemon** (not a
sidecar), and the Kei connector. The connector adds:

- the **Kei Pipe**, Open WebUI's only model provider;
- **`kei_guard`**, a global filter that refuses a turn when kei-proxy isn't
  ready or there is no Open WebUI user;
- the **Governor**, which every governed tool call goes through.

Model inference uses the model configured in Open WebUI or its harness; it
does not go through kei-proxy. Kei governs tool calls, which are checked
against policy and audited. Anything Kei can't decide is refused: it **fails
closed**.

The user is **Open WebUI's own user id**, whatever SSO is configured. Kei
links it to an email-keyed Kei user. Until then the user is **unlinked** and
refused.

## Retrieval sources

| Source | How to retrieve | Use for |
| --- | --- | --- |
| Setup guide | the `kei-openwebui` repository, `docs/setup.md` | The full walk-through this skill follows |
| Release and tool-pack contract | `kei-openwebui` `docs/release.md` | `IMAGE_DIGEST.txt`, tool fields, registering tools by hand on v0.1.0 |
| Design | `kei-openwebui` `docs/design.md` | The gate, agent sessions, supervisor order, known gaps |
| Installed CLI | `kei help` | Exact `kei` flags for this release |
| In this skill | [references/image-and-env.md](references/image-and-env.md), [references/tool-packs.md](references/tool-packs.md) | Environment table, mirroring, the pack format and boot sync |

The code wins over this file. Never invent a flag or an environment variable.

## What every answer must say

- Name the real commands: `kei bot init --platform openwebui`,
  `kei bot credential ... | <secret manager>`, `kei policy create`,
  `kei directory-sync`.
- The model configured in Open WebUI or its harness works without a Kei model
  profile. Model profiles are optional and can pass model credentials; model
  inference does not go through kei-proxy. Write a `tool:<name>` permit for
  each governed tool, using its declared name exactly. Show the command.
- A tool's name matches its `Tools` method as `<method>` or `<prefix>.<method>`
  (or, from v0.1.3, the declaration's `method`). Say so whenever a tool name or
  a "left out of the manifest" warning comes up.
- Deploy the image **by digest** (`@sha256:<digest>`), never by tag.
- The image runs as **UID/GID 10001**.
- Never print, echo or paste `KEI_RUNTIME_TOKEN`.

## 1. Kei side (org owner or admin, after `kei login`)

1. **Agent.** Create the chat agent in the Kei console (the CLI has no agent
   create) and note its id.
2. **Installation**, platform `openwebui`:

   ```sh
   kei bot init --platform openwebui --name acme-chat --agent <agent-id> --workspace <ws>
   kei bot list                     # the installation id
   ```

3. **Credential.** Kei shows it once, and `kei bot credential` refuses to write
   to a terminal. Pipe it into the secret manager:

   ```sh
   kei bot credential --installation <installation-id> --workspace <ws> | <secret-manager import command>
   ```

   Rotation is the same command with `--rotate` (use `kei-credential-rotation`).
   The container also needs `KEI_RUNTIME_CONTROL_PLANE_URL`, the control
   plane's base URL with no `/api/v1`.
4. **Optional model profile.** A model already configured in Open WebUI or
   its harness works without a Kei model profile. Profiles are an opt-in
   convenience for passing model credentials:

   ```sh
   kei model-profiles create --workspace <ws> --display-name acme-chat-model \
     --endpoint https://models.acme.example/v1 --auth-type none \
     --default-model <model> --agent <agent-id>
   kei model-profiles assignment --workspace <ws> --agent <agent-id>
   ```

   `--auth-type api_key` reads the key from stdin and needs a runtime with a
   credential-sync key (`kei-runtime-setup`).
5. **Policies** for governed tools:

   ```sh
   kei policy create --workspace <ws> --group chat-users \
     --allow tool:acme.orders.list_orders
   ```

   - `kei policy create` is group-based: `--group` names the group or
     autogroup, and `--allow` or `--deny` names the target. `kei policies`
     is deprecated; use it only for a `user:<id>` source, a priority or an
     agent scope (`--src-pattern`, `--dst-pattern`, `--effect`, `--name`).
   - A `*` source grants nothing for `tool:` dst policies because the CLI
     does not establish a bundle subject. Use a group (or `user:` through
     the deprecated command) for tool permits; `*` and
     bare/wildcard/`model:`/`connector:` target patterns are silently
     skipped (HAI-673).
   - A write tool runs as soon as a permit allows it.
   - A permit only applies to a **registered** tool (section 3).
   - A harness-executor tool (an Open WebUI tool pack) needs an exact
     `tool:<name>` permit, a **registered** tool, and a **linked user**
     (section 4). It does not need an agent-connector binding: agent-connector
     bindings apply only to connector/MCP tools.
   - Read/write isn't in the request, so name the read and write tools
     separately.
6. **Users.** See section 4.

## 2. The image

- **Pull by digest**, no credentials needed:
  `docker pull public.ecr.aws/o1a1k4g0/openwebui-kei@sha256:<digest>`. The
  digest is the `image=` line of `IMAGE_DIGEST.txt` on the kei-openwebui
  GitHub release. Pin it; tags are for people.
- **Mirror by digest** into your registry so the digest doesn't change. For
  Azure: `az acr import --name <acr> --source public.ecr.aws/o1a1k4g0/openwebui-kei@sha256:<digest> --image openwebui-kei:<tag>`,
  then deploy `<acr>.azurecr.io/openwebui-kei@sha256:<digest>`.
- **UID/GID 10001.** Set the container user, `runAsUser`/`runAsGroup`/
  `fsGroup`, and volume owners to 10001. With 1000 the supervisor refuses to
  start: `KEI_RUNTIME_STATE_DIR (...) is not a writable directory`.
- **Environment:**
  - required: `KEI_RUNTIME_TOKEN`, `KEI_RUNTIME_CONTROL_PLANE_URL`,
    `WEBUI_SECRET_KEY`;
  - with a pack: `KEI_OPENWEBUI_TOOL_PACKS`;
  - optional: `KEI_PROXY_EGRESS_PROXY` / `KEI_PROXY_NO_PROXY` (kei-proxy and
    the tool sync only, never Open WebUI), and `KEI_PROXY_AUDIT` on a volume.

  Full table: [references/image-and-env.md](references/image-and-env.md).
- **Versions.** The boot tool sync needs v0.1.1 or later. Plain-data `tools`
  declarations need v0.1.2 or later.

## 3. Tool packs and the boot tool sync

A tool pack is a Python package layered on the image **at build time**:

```dockerfile
FROM public.ecr.aws/o1a1k4g0/openwebui-kei@sha256:<digest>
USER root
RUN pip install --no-cache-dir acme-orders==<version>
USER kei
ENV KEI_OPENWEBUI_TOOL_PACKS=acme_orders
```

Its top-level module declares `TOOLKITS` as plain data, with a `tools` list per
toolkit. Each tool needs `name` and `access` (`read` or `write`):

```python
TOOLKITS = [{"id": "acme_orders", "name": "Acme: orders", "module": "acme_orders.tools",
             "source": "acme",
             "tools": [{"name": "acme.orders.list_orders", "access": "read"},
                       {"name": "acme.orders.cancel_order", "access": "write"}]}]
```

**The name is the action.** Kei is asked about `tool:<name>`. Name each tool
`<method>` or `<prefix>.<method>` after the `Tools` method that runs it, and use
the same name in the policy. From v0.1.3, a tool whose method has another name
says so in `method` (`"method": "orders_get"`).

**Boot tool sync.** At every boot, after kei-proxy is ready and before Open
WebUI serves, the image PUTs the packs' manifest to
`$KEI_RUNTIME_CONTROL_PLANE_URL/api/v1/runtime/tools` with the runtime token. It
**replaces** the installation's tools. It fails closed:

- With no pack configured, it is skipped.
- With a pack that exports no tools, the container refuses to start: it never
  sends an empty manifest, which would unregister every tool.
- When Kei refuses, it retries 5 times, then the container exits.

**"Left out of the manifest" warnings.** Lead with the matching rule: boot
matches a `Tools` method to the declaration named `<method>` or
`<prefix>.<method>` (`acme.orders.cancel` matches `cancel`), or from v0.1.3 the
one whose `method` names it. The warning means no declaration matched. Then:
diagnostic only if `registered N` is right and the method sends a declared
name; otherwise Kei refuses it (`tool_not_registered`).

Tools reach kei-proxy on the next bundle poll, about a minute later. Details:
[references/tool-packs.md](references/tool-packs.md).

## 4. Linking users

- **Claim link (any SSO).** An unlinked user's governed tool call is refused
  `identity.unlinked`, and the tool body never runs. The connector shows that
  user, and only that user, a one-time claim link as an **Open WebUI
  notification**. It is never in the chat, the model's context or a log. They
  open it, sign in to Kei, and ask again.
- **Entra.** `kei directory-sync` creates the Kei users and groups from the
  Entra app's role assignments (load `kei-directory-sync`). Permits then use
  `group:<role value>`. Each user still links their Open WebUI identity once,
  with the claim link.
- **Check a user:** `kei users resolve --email <email>`,
  `kei users remote-identities list <user>`.

## 5. Verify

In a shell in the container (never print the token):

1. **Boot log:** `kei-seed: tool sync: registered N tool(s) with Kei at /api/v1/runtime/tools (...)`.
2. **Export:** `python -m kei_openwebui.boot --export-manifest` lists the tool
   names.
3. **Bundle:** `"$KEI_PROXY_PATH" policy show`. `tool_count` includes them;
   `policy_revision` and `last_success` are current.
4. **Models:** `GET /v1/models` on `$KEI_RUNTIME_SOCKET_PATH`, with the runtime
   token passed on stdin.
5. **One allowed call** as a linked user with a permit: the answer has data.
6. **One denied call** to a tool with no permit: `Refused (kei.denied): ...`,
   and the tool body never runs.
7. **Audit:** the Kei console's audit view shows both decisions under the
   user's Kei user. Before shipping, they are in the `$KEI_PROXY_AUDIT` spool.

From outside, `kei harness sync --harness openwebui --url <open-webui-url>` (admin
token in `OPENWEBUI_ADMIN_TOKEN`) checks that the Kei Pipe and `kei_guard` are
installed. It is read-only and exits 1 on drift.

## 6. Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| Tool call refused **`tool is not registered in the policy bundle`** (`tool_not_registered`) | Kei hasn't registered the tool: image older than v0.1.1, `KEI_OPENWEBUI_TOOL_PACKS` unset, the name differs from what the method sends, or the bundle hasn't refreshed | Boot log `tool sync: registered N tool(s)`; compare `--export-manifest` names with the refused name; wait a poll, check `policy show` `tool_count`. A permit can't help until the tool is registered |
| Container won't start: **`tool sync refused: ... manifest has no tools`** | The pack declares no governed tools, or the image is older than v0.1.2 and ignores plain-data `tools`. Boot won't PUT an empty manifest: it would unregister every tool | Add a `tools` list (`name`, `access`) to each toolkit; use v0.1.2 or later |
| Container won't start: `tool sync with Kei failed: ... HTTP 401` | Wrong or rotated runtime token | Put the current credential in the secret manager, restart |
| Same, `HTTP 404` | `KEI_RUNTIME_CONTROL_PLANE_URL` has a path (e.g. `/api/v1`) or is the wrong host | Use the base URL |
| Same, `HTTP 409` | The tool name is registered by an admin or another installation | Rename, or remove the other registration |
| Same, network error | Egress | `KEI_PROXY_EGRESS_PROXY` / `KEI_PROXY_NO_PROXY` |
| `KEI_RUNTIME_STATE_DIR (...) is not a writable directory` | Not running as 10001 | Run as UID/GID 10001 |
| User refused **`identity.unlinked`** | Open WebUI user not linked to a Kei user | Open the claim link from the notification; no link → admin checks `kei users remote-identities list` |
| Audit rows show the installation's owner **"via installation"**, denied | No session user: the Open WebUI user is unlinked, so the console attributes the row to the installation subject | Link the user; later rows show their own Kei user |
| **No models** in Open WebUI | Model provider or model configuration in Open WebUI is missing or unavailable | Check Open WebUI's configured model provider, endpoint, credentials, and model name. Kei model profiles are optional credential convenience; inference does not go through kei-proxy. |
| Denied although a permit exists | User is unlinked, the tool is not registered, the policy does not match, or the bundle is stale | Link the Open WebUI user; confirm exact tool registration and permit target/source, then check `policy_revision`. Harness-executor tools do not require an agent-connector binding. |
| Boot warns **`tool sync: <toolkit>.<method> is left out of the manifest: ...`** | Boot matches each `Tools` method to the declaration named `<method>` or `<prefix>.<method>` (`acme.orders.cancel_order` → `cancel_order`), or from v0.1.3 the one whose `method` names it. This method matched none: really ungoverned, or its tool's name isn't `<prefix>.<method>`. Kei governs by the name the method sends, never the method name | Name the tool `<prefix>.<method>` after the method (`acme.orders.cancel` for `cancel`), or from v0.1.3 set the declaration's `method`. Until then the warning is diagnostic only if `registered N` is right and each method sends its declared name |
| Turn fails `Kei governance is unavailable, so this request was not sent` | `kei_guard`: kei-proxy not ready | Check kei-proxy in the container log |

## Validation commands

```sh
kei help | grep -E 'bot init|model-profiles|policy|directory-sync'
kei bot status --installation <installation-id>
kei policy list --workspace <ws>
# in the container:
python -m kei_openwebui.boot --export-manifest
"$KEI_PROXY_PATH" policy show
```

## Realistic usage boundaries

- This is the published image's path. kei-proxy runs **in** the container;
  there is no sidecar mode. Nothing installs at runtime.
- `origin` and `automation_id` stay connector metadata and don't reach Kei's
  policy or audit yet (gap K9). Automations run as their owner and are decided
  like any other call.
- Knowledge embeddings don't go through Kei (no `/v1/embeddings`, gap K1).
- Read/write isn't in the authorize request; write separate permits for read
  and write tools.
- No `kei` command creates agents, and `kei directory-sync` needs a kei-cli
  release after v0.1.29.
- Agents: never print or ask for `KEI_RUNTIME_TOKEN`, never send an empty tool
  manifest (it unregisters every tool), and never run `kei` writes without the
  admin's go-ahead.
