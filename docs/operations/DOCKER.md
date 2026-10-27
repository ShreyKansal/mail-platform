# Docker

## Compose stack (`docker-compose.yml`, development and CI)

| Service | Image | Published (127.0.0.1 only) | Notes |
|---|---|---|---|
| postgres | `postgres:17.5-alpine` | 5432 | Init script creates `mp_app`, `mp_service`, `mail_platform_test` |
| redis | `redis:7.4.4-alpine` | 6379 | AOF enabled |
| mailpit | `axllent/mailpit:v1.25.1` | 8025 (UI) | Captures all relayed mail |
| mx-simulator | built from `infrastructure/docker/mx-simulator` (`node:24.20.0-alpine`, `smtp-server@3.20.2`) | — | Scriptable remote MX; never deploy |
| postfix | built from `infrastructure/postfix` (`debian:bookworm-20250520-slim`) | 10025 | `RELAYHOST=[mailpit]:1025`, so nothing leaves the machine |

Volumes: `postgres-data`, `redis-data`, `postfix-queue`. Bind mount: `./.data/postfix-log` → `/var/log/postfix`. Every image tag is pinned.

## Application images (`infrastructure/docker/app.Dockerfile`)

One multi-stage Dockerfile builds any process:

```sh
docker build -f infrastructure/docker/app.Dockerfile \
  --build-arg SERVICE_DIR=services/mail-worker --build-arg ENTRY=main \
  -t mail-platform/mail-worker .
```

| SERVICE_DIR | ENTRY |
|---|---|
| `apps/api` | `server` |
| `services/{mail-worker,delivery-reconciler,bounce-processor,webhook-dispatcher,domain-verifier,smtp-submission}` | `main` |
| `packages/database` | `migrate` (one-shot migrations job; SQL is copied to `/app/migrations`) |

### Why hoisted `node_modules`

Workspace packages (`@mp/*`) ship TypeScript sources and are **bundled** into the output by tsup (`tsup.config.ts`, `noExternal: /^@mp\//`). Third-party packages stay **external**: bundling them breaks libraries that `require()` Node built-ins or read files next to themselves (pino, `@fastify/swagger-ui`). With pnpm's default isolated layout, a bundle can't resolve dependencies that belong to inlined workspace packages. So the image installs with `--config.node-linker=hoisted`, giving one flat `node_modules`, and the runtime stage copies a production-only flat install.

The runtime stage runs as the unprivileged `node` user with `NODE_ENV=production` (strict configuration validation), `METRICS_HOST=0.0.0.0` (the metrics port must stay on private networks) and `--enable-source-maps`.

CI builds all eight images (`.github/workflows/ci.yml`, job `images`). The API image was smoke-tested locally: `/readyz` reported `{"db":true,"redis":true}`, and production config validation rejected `DNS_FIXTURE_FILE` and `WEBHOOK_ALLOW_PRIVATE_NETWORKS`.

## Not provided

Production Postfix configuration per node (IP binding, real `MTA_HOSTNAME`), image publishing to a registry, and SBOM/signing. See [PRODUCTION-DEPLOYMENT](PRODUCTION-DEPLOYMENT.md).
