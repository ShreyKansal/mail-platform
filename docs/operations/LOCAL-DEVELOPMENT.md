# Local development

## Local sending quotas

`LOCAL_UNLIMITED_SENDING=true` with `NODE_ENV=development` disables the organization's daily and per-minute recipient quotas for local API and SMTP submission. The local environment template enables it; add it to an older `.env` and restart the application services to opt in. The dashboard reports “Unlimited — local development” instead of the stored tenant quota. Set the flag to `false` to test quota enforcement.

Open **Settings → Sending limits** to save recipients per rolling 24 hours and per minute. Owners/admins can toggle unlimited local sending without restarting. Numeric limits remain saved while unlimited is enabled; turn it off to enforce those limits, including existing usage. Preferences are stored per organization and apply to API and SMTP submission. New organizations inherit the environment default until a preference is saved. Run `pnpm --filter @mp/database migrate` when updating an existing checkout.

The flag is ignored outside development. Quota editing through the dashboard is disabled in production; production quotas remain administrator managed. Domain verification, suspended-account restrictions, suppression handling, request/message size limits and authentication still apply. This removes recipient quotas; it does not imply infinite throughput. The default local Postfix configuration captures outbound mail in Mailpit.

The top header contains centered page breadcrumbs and email search (press Enter to search subjects, senders and recipients). Its **Open API examples** button opens a right-side sheet with the downloadable Morphmailer JavaScript/TypeScript SDK and copyable send/batch examples. Other language tabs use the REST API directly. Replace the example API key, sender and recipient before running a request. Quotas remain visible in Settings; sandbox badges and the workspace banner are omitted from the application shell.

The SDK is in [`packages/morphmailer`](../../packages/morphmailer/README.md). Run `pnpm sdk:bundle` to build its ESM/CommonJS modules and declarations, then create the installable archive at `apps/dashboard/public/downloads/morphmailer-0.1.0.tgz`. Dashboard dev/build commands also generate this archive, so the side-sheet download works on a fresh checkout. Install the downloaded archive with `npm install ./morphmailer-0.1.0.tgz`; the package has not been published to npm.

**Purpose.** Run the complete platform on one machine: real Postfix, real DKIM, real bounce processing. **No mail leaves the machine.**

## Prerequisites

| Tool | Version | Windows | macOS / Linux |
|---|---|---|---|
| Node.js | 24.x (24.20.0 tested) | `winget install OpenJS.NodeJS.LTS` | nvm / package manager |
| pnpm | 9.15.4 | `npm i -g pnpm@9.15.4` (or `corepack enable`) | same |
| Docker | Desktop or Engine with Compose v2 | Docker Desktop (WSL2 backend) | Docker Desktop / Engine |
| Git | any recent | `winget install Git.Git` | package manager |

> **OneDrive / Dropbox caveat (Windows).** Don't keep the repository in a synced folder. Syncing `node_modules`, `.data/` and Docker bind mounts causes file locks (`EPERM`), slow installs and huge sync queues. Use a path like `C:\dev\mail-platform`.

## First run

```sh
pnpm install
pnpm setup           # writes .env with generated secrets, .data/postfix-log, .data/dns-fixture.json
pnpm dev:infra       # postgres, redis, mailpit, mx-simulator, postfix (waits for health)
pnpm db:migrate      # needs DATABASE_MIGRATION_URL from .env:
#   PowerShell: $env:DATABASE_MIGRATION_URL='postgres://mp_owner:mp_owner_dev@127.0.0.1:5432/mail_platform'; pnpm db:migrate
#   bash:       DATABASE_MIGRATION_URL=postgres://mp_owner:mp_owner_dev@127.0.0.1:5432/mail_platform pnpm db:migrate
```

The Postgres init script (`infrastructure/docker/postgres/init/01-roles.sh`) creates the roles `mp_app` (RLS-enforced) and `mp_service` (BYPASSRLS), plus a `mail_platform_test` database. It runs only when the volume is first created. To reset everything: `docker compose down -v`.

## Run the services

Each command runs in its own terminal and loads `../../.env` through `tsx --env-file`:

| Command | Process | Port |
|---|---|---|
| `pnpm dev:api` | API (Fastify) | 3000; metrics 9100 |
| `pnpm dev:dashboard` | Vite dev server, proxies `/v1`, `/auth`, `/docs` to the API | 5173 |
| `pnpm dev:worker` | mail-worker (dispatch to Postfix :10025) | metrics 9101 |
| `pnpm dev:reconciler` | Postfix log reconciler | metrics 9102 |
| `pnpm dev:bounces` | bounce processor | 2525; metrics 9103 |
| `pnpm dev:webhooks` | webhook dispatcher | metrics 9104 |
| `pnpm dev:verifier` | scheduled domain verifier | metrics 9105 |
| `pnpm dev:smtp` | SMTP submission | 2587 STARTTLS, 2465 TLS; metrics 9106 |

Open <http://localhost:5173>, sign up (`ALLOW_PUBLIC_SIGNUP=true` in `.env`) and add a domain. API reference: <http://localhost:3000/docs>.

## DNS without owning a domain

`DNS_FIXTURE_FILE=../../.data/dns-fixture.json` makes the API and the verifier read DNS from a JSON zone instead of the Internet. This is development only, and configuration validation rejects it in production. After adding a domain, "publish" its generated records with:

```sh
pnpm --filter @mp/api dev:publish-dns example.test [--dmarc "v=DMARC1; p=reject"]
```

Then click **Check DNS now**. The zone file is re-read on every check, so you can also edit it by hand to simulate mistakes: a wrong DKIM key, duplicate SPF records, a missing MX.

## Where mail goes

* All external recipients are relayed by Postfix to **Mailpit**: <http://localhost:8025>.
* Recipients `@mx-sim.test` go to the **MX simulator**, which behaves according to the local-part prefix:

| Prefix | Simulated response |
|---|---|
| `accept…` | 250 accepted |
| `unknown…` | 550 5.1.1 at RCPT → hard bounce + suppression |
| `policy…` | 550 5.7.1 → policy rejection (not suppressed) |
| `full…` | 452 4.2.2 → deferred until the queue lifetime expires (10 min in dev) → `FAILED` |
| `defer…` | 451 4.7.1 greylisting for `GREYLIST_SECONDS` (20 s), then accepted |
| `datafail…` | accepted at RCPT, 554 5.6.0 after DATA → content rejection |

* Postfix's log is at `.data/postfix-log/maillog`.

## Tests

```sh
pnpm typecheck
pnpm test                 # unit tests (no infrastructure needed)
pnpm test:integration     # needs `pnpm dev:infra`; stop `pnpm dev:bounces` first (port 2525)
```
See [TEST-STRATEGY](../testing/TEST-STRATEGY.md).

## Common problems

| Problem | Fix |
|---|---|
| `Invalid environment configuration` | Run `pnpm setup`, or compare `.env` with `.env.example` |
| Integration suite: `port 2525 is in use` | Stop the dev bounce processor |
| Bounces never processed | Make sure the bounce processor is running. Postfix reaches it through `host.docker.internal:2525`. On Linux, set `BOUNCE_HOST=0.0.0.0`. |
| Recipients stuck `MTA_ACCEPTED` | The reconciler isn't running, or `POSTFIX_LOG_PATH` is wrong |
