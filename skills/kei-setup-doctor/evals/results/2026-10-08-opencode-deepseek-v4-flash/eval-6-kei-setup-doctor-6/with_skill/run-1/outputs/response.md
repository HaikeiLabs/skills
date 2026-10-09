## Diagnosis

The container image's final `FROM` stage (likely `node:22-slim` or similar Debian-based slim image) lacks the `ca-certificates` package. Go's `crypto/tls` needs the system CA pool to verify the control-plane TLS certificate, but slim images omit it.

## Fix

Add to the Dockerfile's final stage, before any non-build steps:

```dockerfile
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
```

For Alpine-based images:

```dockerfile
RUN apk add --no-cache ca-certificates
```

## Verify

```sh
docker run --rm --entrypoint ls <image> /etc/ssl/certs/ca-certificates.crt
```

A missing or empty file confirms the CA pool was absent. Rebuild, redeploy, and confirm kei-proxy bootstraps without TLS errors and the installation transitions out of `pending` with a heartbeat.
