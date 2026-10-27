# Builds one platform process into a minimal runtime image.
#
#   docker build -f infrastructure/docker/app.Dockerfile \
#     --build-arg SERVICE_DIR=services/mail-worker --build-arg ENTRY=main -t mail-platform/mail-worker .
#
#   SERVICE_DIR  apps/api | services/<name> | packages/database (migrations job)
#   ENTRY        server (api) | main (services) | migrate (database)

FROM node:24.20.0-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /repo

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile --config.node-linker=hoisted
ARG SERVICE_DIR
ARG ENTRY=main
RUN cd "$SERVICE_DIR" && pnpm exec tsup "src/$ENTRY.ts" --config ../../tsup.config.ts

FROM base AS prod-deps
COPY . .
RUN pnpm install --frozen-lockfile --prod --config.node-linker=hoisted

FROM node:24.20.0-alpine AS runtime
ARG SERVICE_DIR
ARG ENTRY=main
# Metrics listen on all container interfaces; keep the metrics port off public networks.
ENV NODE_ENV=production ENTRY=${ENTRY} METRICS_HOST=0.0.0.0
WORKDIR /app
COPY --from=prod-deps /repo/node_modules ./node_modules
COPY --from=build /repo/${SERVICE_DIR}/dist ./dist
# Migrations job only: SQL files next to the bundle (migrate.ts resolves ../migrations).
COPY --from=build /repo/packages/database/migrations ./migrations
USER node
CMD ["sh", "-c", "exec node --enable-source-maps dist/${ENTRY}.js"]
