# OpenAPI specification

The API's OpenAPI 3.1 document is generated from the same Zod schemas the server uses to validate requests and serialize responses (`packages/contracts`). It cannot drift from the running code.

## Where to find it

| Location | What |
| --- | --- |
| `GET /docs` | Interactive Swagger UI, served by the API without authentication. In local development: `http://localhost:3000/docs`, or `http://localhost:5173/docs` through the dashboard. |
| `GET /docs/json` | The live OpenAPI document as JSON. |
| `docs/api/openapi.json` | The committed snapshot in this repository. |

To try requests from Swagger UI, click **Authorize** and paste an API key (without the `Bearer ` prefix).

## Regenerating the snapshot

```bash
pnpm openapi
```

This runs `apps/api/src/export-openapi.ts`. It builds the application with placeholder configuration (no database or Redis connection) and writes `docs/api/openapi.json`. CI regenerates the file and fails if it differs from the committed copy, so any API change must ship with an updated spec.

## Generating clients

The document is standard OpenAPI 3.1, so client generators that support 3.1 can consume it. Security is declared as an HTTP bearer scheme (`bearerAuth`). Dashboard-only `/auth/*` routes are tagged "Dashboard auth"; exclude them from server SDKs.
