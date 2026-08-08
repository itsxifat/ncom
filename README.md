# NCOM

A multi-tenant SaaS landing-page builder: visual drag-and-drop page editor,
reusable templates, media library, publishing pipeline with subdomain
routing, SEO/analytics scaffolding, and an admin panel.

## Stack

Next.js 16 (App Router, Turbopack) · TypeScript · Tailwind CSS v4 ·
PostgreSQL + Prisma 7 · Auth.js v5 · Redis · S3-compatible or local
filesystem storage.

## Local development

Prerequisites: Node.js, pnpm, PostgreSQL 18+, Redis, running locally (no
Docker required — every service here has a native install).

1. Copy `.env.example` to `.env.local` and fill in the values (see below).
2. Install dependencies: `pnpm install`
3. Apply the schema: `pnpm exec prisma migrate dev`
4. Seed demo data (a SUPER_ADMIN user, a demo org/project, section
   component definitions, and two example templates):
   `pnpm exec prisma db seed`
5. Start the dev server: `pnpm dev`

The seed's admin login is `admin@ncom.local` / `changeme123` unless
overridden via `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`.

### Environment variables

| Variable                                                                                             | Notes                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                                                                       | PostgreSQL connection string.                                                                                                                                                                              |
| `AUTH_SECRET`                                                                                        | `openssl rand -base64 32`.                                                                                                                                                                                 |
| `AUTH_URL`                                                                                           | The app's own base URL (e.g. `http://localhost:3000` in dev, the production HTTPS URL in prod). Also used as the base for NCOM's own `sitemap.ts`/`robots.ts`.                                             |
| `ROOT_DOMAIN`                                                                                        | The apex domain tenant sites hang off of, e.g. `ncom.app` in production or `localhost:3000` in dev — `*.localhost:PORT` resolves natively in every modern browser, no `/etc/hosts` editing needed locally. |
| `STORAGE_DRIVER`                                                                                     | `local` (filesystem, dev-only) or `s3` (AWS S3 / Cloudflare R2 / MinIO).                                                                                                                                   |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_URL` | Required only when `STORAGE_DRIVER=s3`.                                                                                                                                                                    |
| `REDIS_URL`                                                                                          | Rate limiting, subdomain→project resolution cache, published-page snapshot cache.                                                                                                                          |

## Multi-tenant subdomain routing

`src/proxy.ts` inspects the `Host` header on every request. A request to
`{subdomain}.${ROOT_DOMAIN}` is rewritten to `/sites/{subdomain}/...` (the
public renderer) and bypasses auth entirely — that path is public by
design. Everything else goes through the normal dashboard/admin auth flow
unchanged.

**Production DNS**: point a wildcard record (`*.ncom.app` → your app's
IP/CNAME) alongside the apex/`app.` record used for the dashboard itself.
Reserved subdomains (`www`, `app`, `admin`, `api`, `preview`, …) are
excluded from tenant routing — see `src/lib/reserved-subdomains.ts`.

## Deployment checklist

- Run `pnpm exec prisma migrate deploy` (not `migrate dev`) against the
  production database as part of your deploy step — it applies pending
  migrations without prompting or generating new ones.
- Set `STORAGE_DRIVER=s3` in production; the local filesystem driver
  writes into `public/media-uploads` on the app server's own disk, which
  doesn't survive redeploys or scale past one instance.
- `NODE_ENV=production` disables the dev-only CSP allowances (`unsafe-eval`,
  local WebSocket origins) and adds `Strict-Transport-Security` — see
  `next.config.ts`.
- Point the wildcard DNS record described above at your deployment before
  testing tenant sites; until then `{subdomain}.${ROOT_DOMAIN}` won't
  resolve.
- Redis and PostgreSQL are both required at runtime (not optional
  dev-only dependencies) — rate limiting and the auth session/adapter both
  depend on them.

## Scripts

- `pnpm dev` — start the dev server (Turbopack).
- `pnpm build` / `pnpm start` — production build and serve.
- `pnpm lint` — ESLint.
- `pnpm exec tsc --noEmit` — type-check without emitting.
- `pnpm exec prisma migrate dev` — create/apply a migration in dev.
- `pnpm exec prisma db seed` — re-run the seed script (upserts, safe to
  run repeatedly).
