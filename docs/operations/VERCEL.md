# Vercel dashboard deployment

Vercel hosts the dashboard. The current deployment also needs a publicly reachable HTTPS API, PostgreSQL, Redis, Postfix and the mail processing services. SMTP listeners and the Postfix queue remain on a separate mail host.

Use the repository root as the Vercel project root. `vercel.json` installs the pnpm workspace and runs `pnpm build:vercel`. Set `API_ORIGIN` in Vercel to your backend HTTPS origin, with no path or trailing endpoint. The build refuses a missing backend or localhost.

The build generates Vercel Build Output API files in `.vercel/output`. Authentication, `/v1` and API documentation are proxied to the backend before the React Router fallback. Static assets and SDK downloads are included; source maps are excluded from the uploaded static output. Local environment files and mail data are excluded from source uploads.

On the backend set `DASHBOARD_ORIGIN` to the exact dashboard HTTPS origin and `COOKIE_SECURE=true`. Keep `ALLOW_PUBLIC_SIGNUP=false` until account admission is ready. Use the same dashboard hostname when testing session cookies. Preview domains need their own matching backend origin configuration.

For a local prebuilt deployment, set `API_ORIGIN`, run `pnpm build:vercel`, then use an authenticated Vercel CLI with `vercel deploy --prebuilt`. Verify login, session persistence, CSRF-protected writes, deep links and a captured delivery before promoting to production.

This setup does not migrate the local database or deploy the mail host. Follow [Production deployment](PRODUCTION-DEPLOYMENT.md) for those services.
