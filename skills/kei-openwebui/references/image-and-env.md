# openwebui-kei: image and environment

Source: the `kei-openwebui` repository (`Dockerfile`, `docker/entrypoint.sh`,
`docs/release.md`, `docs/setup.md`).

## Where the image is

- Repository: `public.ecr.aws/o1a1k4g0/openwebui-kei` (ECR Public, no
  credentials to pull).
- Each kei-openwebui GitHub release attaches `IMAGE_DIGEST.txt`:

  ```
  image=public.ecr.aws/o1a1k4g0/openwebui-kei@sha256:<digest>
  tag=public.ecr.aws/o1a1k4g0/openwebui-kei:vX.Y.Z
  kei_proxy_version=<version>
  openwebui_image=ghcr.io/open-webui/open-webui:<version>@sha256:<digest>
  revision=<commit sha>
  ```

  Deploy `image=`. There is no `latest`, and a tag is never overwritten.
- The image is `linux/amd64`.

## Mirroring by digest

Copy by digest so your registry holds the same digest:

```sh
az acr import --name <your-acr> \
  --source public.ecr.aws/o1a1k4g0/openwebui-kei@sha256:<digest> \
  --image openwebui-kei:<tag>
```

Deploy `<your-acr>.azurecr.io/openwebui-kei@sha256:<digest>`. Layer a tool pack
`FROM` that same digest, then deploy your layer by its own digest.

## Runtime user

User `kei`, UID 10001, GID 10001. `/app/backend/data`, `/var/lib/kei-proxy`
(0700) and `/run/kei-proxy` belong to it. Set the platform's container
user, `runAsUser`, `runAsGroup`, `fsGroup` and mounted volumes' owner to
10001.

## Supervisor order

`docker/entrypoint.sh`:

1. `kei-proxy runtime bootstrap`. If it fails: `kei-proxy runtime bootstrap
   failed; refusing to start`.
2. `kei-proxy serve`, then wait for `/readyz` on the socket.
3. `kei-proxy runtime heartbeat`.
4. `python -m kei_openwebui.boot --sync-tools`, the boot tool sync.
5. `python -m kei_openwebui.boot` seeds the Kei functions.
6. Open WebUI starts.

The long-running processes live and die together. On a fresh database with no
Open WebUI admin, Open WebUI starts and the functions are seeded once the first
admin signs up. Until then there is no model provider.

## Environment

| Variable | Required | Notes |
| --- | --- | --- |
| `KEI_RUNTIME_TOKEN` | yes | Runtime installation credential, from the secret manager. Never printed |
| `KEI_RUNTIME_CONTROL_PLANE_URL` | yes | Kei control plane base URL, no `/api/v1` |
| `WEBUI_SECRET_KEY` | yes | Shared by replicas. Missing: `WEBUI_SECRET_KEY is not set; refusing to start` |
| `KEI_OPENWEBUI_TOOL_PACKS` | with a pack | Comma-separated pack modules |
| `KEI_PROXY_EGRESS_PROXY` | no | Becomes `HTTPS_PROXY`/`HTTP_PROXY` for kei-proxy processes and `kei-proxy identity link` only; the boot tool sync applies it in its own client. Open WebUI never sees it |
| `KEI_PROXY_NO_PROXY` | no | Becomes `NO_PROXY` alongside it |
| `KEI_PROXY_AUDIT` | recommended | Audit spool path; put it on a volume (gap K8) |
| `KEI_PROXY_HEARTBEAT_INTERVAL` | no | Default `1m` |
| `KEI_PROXY_READY_TIMEOUT` | no | Seconds to wait for `/readyz`, default `60` |

Set by the image; don't override: `KEI_RUNTIME_STATE_DIR=/var/lib/kei-proxy`,
`KEI_RUNTIME_SOCKET_PATH=/run/kei-proxy/runtime.sock`,
`KEI_PROXY_PATH=/opt/kei/bin/kei-proxy`, `ENABLE_OPENAI_API=false`,
`ENABLE_OLLAMA_API=false`, `ENABLE_DIRECT_CONNECTIONS=false`.

`UVICORN_WORKERS` is not constrained: agent sessions are per chat.

## Checks inside the container

Pass the token on stdin, never on a command line:

```sh
curl -fsS --unix-socket "$KEI_RUNTIME_SOCKET_PATH" http://kei-proxy/readyz; echo
printf 'header = "Authorization: Bearer %s"\n' "$KEI_RUNTIME_TOKEN" | \
  curl --config - -sS --unix-socket "$KEI_RUNTIME_SOCKET_PATH" http://kei-proxy/v1/models; echo
"$KEI_PROXY_PATH" policy show
```
