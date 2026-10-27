# Contributing

## Ground rules

- **No mocks in production paths.** Features ship with real persistence, authorization, validation and tests. Test doubles belong only in tests: the fixture DNS client and the MX simulator.
- **Truthful status.** Never label remote SMTP acceptance as delivery to the inbox. Never present an estimate as a measurement.
- **Tenant safety.** Every query on the API path runs inside `withTenant` (RLS-enforced). Service-role queries must filter by `org_id` explicitly.
- **Secrets.** Never log credentials or message bodies. The pino redaction list lives in `packages/shared/src/logger.ts`.

## Workflow

1. `pnpm install`, then `pnpm setup` and `pnpm dev:infra` (see [docs/operations/LOCAL-DEVELOPMENT.md](docs/operations/LOCAL-DEVELOPMENT.md)).
2. Make the change with tests next to the code (`*.test.ts`). Suites that touch Postfix or the database go under `tests/`.
3. If you change the database schema, edit `packages/database/src/schema.ts`, run `pnpm db:generate`, review the SQL, and add grants and RLS for new tenant tables in a custom migration.
4. If you change API routes or contracts, run `pnpm openapi` and commit `docs/api/openapi.json`. CI fails if it is out of date.
5. If you add a dependency, run `pnpm pin-deps` so versions stay exact.
6. Run `pnpm typecheck && pnpm test && pnpm test:integration`.
7. Update the relevant Markdown under `docs/` and the [feature matrix](docs/product/FEATURE-MATRIX.md).

## Code style

Dashboard work follows [the ADS implementation guide](docs/design/IMPLEMENTATION.md), the [element catalog](docs/design/ATLASSIAN-CATALOG.md), and [dashboard rules](apps/dashboard/AGENTS.md). Run `pnpm audit:design` alongside dashboard checks. These project rules are adaptations linked to official sources, not a claim of Atlassian certification.

Strict TypeScript, no `any` without a comment explaining why, Zod at every boundary, structured `AppError`s instead of ad-hoc throws, and no broad `try/catch` that hides failures.
