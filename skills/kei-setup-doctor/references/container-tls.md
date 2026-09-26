# Container TLS certificate reference

Use this reference when the runtime container logs show a TLS verification
failure during kei-proxy bootstrap. This applies to any containerised runtime
image (ECS, EKS, AKS, Container Apps, or local Docker).

## Symptom

The runtime container logs contain:

```
tls: failed to verify certificate: x509: certificate signed by unknown authority
```

The kei-proxy process fails to bootstrap and the Node/harness server never
starts. Other processes in the same container that make HTTPS calls may also
fail.

## Root cause

The container image's final stage uses a Debian `*-slim` base (for example
`node:22-slim`) that does not include the `ca-certificates` package. Go's
`crypto/tls` package uses the operating system's Certificate Authority (CA)
pool to verify TLS connections. When the system CA pool is empty, Go cannot
validate any TLS certificate and rejects every HTTPS connection with the
"certificate signed by unknown authority" error.

CAs installed in an earlier build stage via `apt`, `yum`, or `apk` do **not**
carry over into the final stage unless the final stage installs them itself.
Only the final stage's packages determine the contents of the runtime
filesystem.

## Fix

In the Dockerfile's final `FROM` stage, add the `ca-certificates` package
before any non-build steps:

```dockerfile
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
```

For Alpine-based images, use:

```dockerfile
RUN apk add --no-cache ca-certificates
```

Rebuild and redeploy the image.

## Verification

1. Confirm that the `/etc/ssl/certs/ca-certificates.crt` file exists in the
   image. This is the bundle that Go loads on Debian-based systems:

   ```sh
   docker run --rm --entrypoint ls <image> /etc/ssl/certs/ca-certificates.crt
   ```

   A missing or empty file confirms the CA pool is absent.

2. Restart the runtime and check the container logs for a successful kei-proxy
   bootstrap (no TLS errors).

3. Confirm the installation transitions out of `pending` and reports a
   heartbeat:

   ```sh
   kei bot status --installation INSTALLATION_ID --api-url CONTROL_PLANE_URL
   ```
