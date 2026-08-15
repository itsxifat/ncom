# NCOM

A multi-tenant SaaS landing-page builder: visual drag-and-drop page editor,
reusable templates, media library, publishing pipeline with subdomain
routing, SEO/analytics scaffolding, and an admin panel.

## Stack

Next.js 16 (App Router, Turbopack) · TypeScript · Tailwind CSS v4 ·
PostgreSQL + Prisma 7 · Auth.js v5 · Redis · EnCDN media storage.

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

| Variable                        | Notes                                                                                                                                                                                                      |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                  | PostgreSQL connection string.                                                                                                                                                                              |
| `AUTH_SECRET`                   | `openssl rand -base64 32`.                                                                                                                                                                                 |
| `AUTH_URL`                      | The app's own base URL (e.g. `http://localhost:3000` in dev, the production HTTPS URL in prod). Also used as the base for NCOM's own `sitemap.ts`/`robots.ts`.                                             |
| `ROOT_DOMAIN`                   | The apex domain tenant sites hang off of, e.g. `ncom.app` in production or `localhost:3000` in dev — `*.localhost:PORT` resolves natively in every modern browser, no `/etc/hosts` editing needed locally. |
| `CDN_BASE_URL`                  | EnCDN instance the media library uploads to and serves from, e.g. `https://cdn.enfinito.cloud`.                                                                                                            |
| `CDN_API_KEY`, `CDN_API_SECRET` | EnCDN client credentials (admin panel → Clients → View credentials). Server-side only — they are never sent to the browser.                                                                                |
| `CDN_SIGNED_URLS`               | `true` (default) stores lifetime signed delivery URLs; `false` stores plain ones. See "Media storage" below.                                                                                               |
| `CDN_CLIENT_ID`                 | Optional. Read out of EnCDN's upload response automatically; set only to override it.                                                                                                                      |
| `REDIS_URL`                     | Rate limiting, subdomain→project resolution cache, published-page snapshot cache.                                                                                                                          |

## Media storage

All uploads live on [EnCDN](https://cdn.enfinito.cloud) — there is no
object-storage bucket and no local upload directory. The browser posts the
file to `POST /api/media/upload`, which authenticates the caller, re-encodes
the image to WebP with sharp (max 2400px, quality 82), forwards the result
to EnCDN, and records the returned filename on `MediaAsset.storageKey`.
Uploads go through the server because the EnCDN API key and secret must
stay server-side, so there is no presigned browser-direct upload step.

**Signed URLs.** By default (`CDN_SIGNED_URLS=true`) each asset is stored
with a lifetime signed delivery URL. Signed URLs bypass EnCDN's domain
locking, which matters here because tenant sites are served from arbitrary
subdomains and customer domains that a `Referer` whitelist could never be
kept in sync with. The cost is that **rotating `CDN_API_SECRET` invalidates
every stored URL** — every asset would need re-signing. Set
`CDN_SIGNED_URLS=false` to store plain delivery URLs instead; only do that
if the EnCDN client is in `public` access mode.

**Replacing an image.** EnCDN assigns a new UUID filename to every upload
and cannot overwrite an existing one, so replacing an image produces a new
URL. `replaceMediaAsset` therefore rewrites references to the old URL in
the organization's draft page sections and in template sections. Published
`PageVersion` snapshots are intentionally left untouched — they are
immutable records of what was published, so a live page keeps rendering
the previous image until it is republished, and the old file is left on
the CDN for exactly as long as some published snapshot still references
it.

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

### Custom domains

A `Host` that is neither `ROOT_DOMAIN` nor a tenant subdomain is treated as a
tenant's own domain. The proxy does **not** resolve it — it must never read the
database — so the hostname is passed through in the route slot as `~example.com`
(see `src/lib/site-handle.ts`) and `resolveSiteHandle` maps it to a store inside
the route, cached in Redis for a minute.

Consequence: every hostname the platform itself answers on must be listed in
`PLATFORM_HOSTS`, or dashboard requests to it get rewritten to a storefront
lookup and 404.

Verification is a TXT challenge at `_ncom-challenge.<hostname>`, checked against
public resolvers rather than the host's own. Ownership (TXT) and routing
(CNAME/A) are reported separately, because "your record is visible but traffic
still goes elsewhere" is actionable and "verification failed" is not. Tenants
manage domains under a store's Settings; platform admins see all of them, and
can force a status, under `/admin/domains`.

## Plans, limits and platform billing

What NCOM sells to its own tenants — distinct from the commerce section below,
which is what merchants sell to shoppers. Nothing here is scoped to a Store.

Everything is data: plans, quotas, feature gates, add-ons and coupons are rows
edited from `/admin/plans`, `/admin/addons` and `/admin/coupons`, and take effect
on the next request. `prisma/plan-catalog.ts` seeds the published price sheet
once and then never overwrites it, so a re-seed cannot revert a price someone
changed in the admin.

- **Entitlements** resolve in `entitlementService.getEntitlements()`: plan limit,
  then the subscription's per-workspace override, then add-on grants. `null`
  means unlimited and `0` means none allowed — a distinction the whole model
  depends on, so use `isWithinQuota` rather than comparing by hand.
- **Enforcement** lives in the services that write, not in the server actions, so
  a quota cannot be bypassed by reaching the service from another route. Pages,
  sites, media uploads, seats, domains, premium templates, advanced SEO and each
  analytics integration are all gated.
- **Metering**: pages/sites/domains/seats/storage are counted live from their own
  tables; traffic and visitors accumulate into `UsageCounter`, keyed by UTC month.
  Sites past a traffic cap serve a holding page — gated on both the plan's
  `enforceTrafficCap` and the platform flag, since taking a customer's site
  offline automatically is the most damaging thing here.
- **Billing without a gateway**: checkout is real (quote → coupon → order), but no
  provider is wired. A ৳0 total (free plan, or a 100%-off coupon) is
  `AUTO_ACTIVATED` and access is granted immediately; anything above ৳0 becomes
  `AWAITING_PAYMENT` and grants nothing until an admin activates it from
  `/admin/subscriptions`. `activateOrder` is the single seam a future gateway
  webhook calls — nothing else grants entitlements.

The seeded `NCOMEXPLORE` coupon is 100% off, forever, restricted to workspaces
that existed when it was created — the onboarding offer, without handing the same
deal to next month's signups.

## Authentication

### The first administrator

There is no seeded admin account — a default `admin@ncom.local` / `changeme123`
is a credential every clone of this repo shares, and the copy that reaches
production is how platforms get taken over. Instead, **the first account to
register claims `SUPER_ADMIN`**, and that claim is guarded three ways
(`claimFirstAdmin` in `server/services/authService.ts`):

1. No user may already hold `SUPER_ADMIN` — counted including suspended ones, so
   suspending or demoting the admin does not re-arm the bootstrap.
2. A one-shot latch row (`platform.adminBootstrapClaimed` in
   `PlatformSetting`), claimed with `INSERT … ON CONFLICT DO NOTHING`. Postgres
   decides the race, so two simultaneous registrations can never both win. The
   latch is what makes the close **permanent**: deleting every admin, or
   restoring a backup, does not re-open the path, because nothing in the
   application deletes that row — the raw settings editor explicitly refuses to.
3. `ADMIN_BOOTSTRAP_EMAIL`, if set, restricts the claim to that one address.

**Set `ADMIN_BOOTSTRAP_EMAIL` on any internet-reachable deployment.** Without it
the design has one unavoidable window: between a fresh instance going live and
the owner registering, whoever signs up first becomes the administrator. With it,
that is impossible.

Both signup paths claim it — credentials and Google — so an operator offering
only OAuth can still get a first admin. The event is written to the audit log as
`platform.admin.bootstrapped`.

**Recovery** (locked out, e.g. the first registration used a typo'd email) needs
direct database access, deliberately — there is no in-app route to it:

```sql
DELETE FROM "PlatformSetting" WHERE key = 'platform.adminBootstrapClaimed';
UPDATE "User" SET "platformRole" = 'USER' WHERE "platformRole" = 'SUPER_ADMIN';
```

The next registration then claims the seat again.

### Providers

Credentials (email + password) and Google. Google is only registered when
`AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET` are set; the admin flag
`auth.googleLoginEnabled` decides whether the button is offered when they are.
Google signups skip OTP because Google already asserts the address is verified —
and the provider's `profile()` records verification only when it actually says so.

Email signups confirm with a 6-digit code (10 minutes, 5 attempts, hashed at
rest). The gate is in the dashboard and admin layouts and reads the database, not
the JWT, so verifying takes effect on the next request rather than when the token
expires. A platform with no SMTP server configured auto-verifies instead of
locking every new account out.

## Outbound email

SMTP credentials live in the database, edited at `/admin/email`, with one server
per purpose and `DEFAULT` as the fallback. Passwords are encrypted with
`lib/crypto.ts` (AES-256-GCM, key derived from `AUTH_SECRET`) and the admin only
ever sees a mask. The split exists so verification codes and marketing mail never
share a sending reputation. Every attempt is recorded in `EmailLog` — subject and
recipient, never the body and never the code.

## Commerce & Liquid

Commerce lives behind `Project.type = STORE`. A LANDING project carries no
commerce rows at all — `storeService.enableStore()` is the one transition
that provisions `StoreSettings`, a default location, a catch-all shipping
zone and starter theme templates.

**Money is always integer minor units** (cents, paisa) with the currency on
the owning aggregate, never a float and never a per-amount currency. Rates
are basis points. See `src/lib/money.ts`; `allocate()` in particular is what
keeps per-line discounts summing exactly to the order-level discount.

**Pricing** is split in two: `src/lib/pricing.ts` is pure arithmetic with no
I/O (discounts → shipping → tax → totals, in that order — the order is the
specification), and `src/server/services/pricingService.ts` loads the data
and calls it. Totals are recomputed server-side on every cart read and again
at checkout; nothing the client sends about price is ever trusted.

**Checkout** (`checkoutService.placeOrder`) runs in one transaction and
guarantees three things: idempotency (via `Cart.completedAt` + the unique
`Order.cartId`, so a double-submit returns the same order), authority
(totals recomputed, never accepted from the client), and atomic stock (a
conditional `UPDATE … WHERE available >= n`, so two checkouts cannot both
take the last unit).

**Orders are append-only where money is concerned.** Line titles, SKUs and
prices are snapshots taken at purchase; corrections add `Refund` and
`Transaction` rows rather than rewriting amounts.

### The Liquid layer

Tenant-authored templates run through a sandboxed LiquidJS engine
(`src/lib/liquid/engine.ts`). The configuration there is a security
boundary, not tuning — `ownPropertyOnly` blocks prototype/constructor
walking, the in-memory `templates` map means `{% render %}` has no
filesystem to reach, and `parseLimit`/`renderLimit`/`memoryLimit` bound
runaway templates (verified: a `(1..100000000)` loop is stopped by the
memory limit in milliseconds).

Two rendering paths:

- **Builder sections** — a `ComponentDefinition` with `renderMode = LIQUID`
  carries `liquidSource` plus a `{% schema %}` block. The schema compiles to
  the same `FieldConfig[]` the React sections declare, so a Liquid section
  gets a real Inspector form. These are compiled to HTML **at publish time**
  into `PageVersion.snapshot`, so the public request path never executes an
  untrusted template and liquidjs never enters the client bundle.
- **Storefront routes** — product, collection and cart pages render from
  `StorefrontTemplate.publishedSource`. These are request-dependent so the
  sandbox does run per request, which is why the limits above matter.

Every route falls back to a built-in React layout when a store has not
published theme code, so Liquid is an opt-in escape hatch rather than a
prerequisite for selling. The object model exposed to templates is
documented in `src/lib/liquid/drops.ts` — treat it as a public API, since
renaming a key breaks live storefronts.

### Payments

Each store brings its own gateway credentials, stored encrypted with
AES-256-GCM (`src/lib/crypto.ts`) under a key derived from `AUTH_SECRET` via
HKDF — separate from the session-signing key, so one compromise is not two.
Decrypted secrets never leave the server; the admin shows a masked preview.

Stripe card fields render inside an iframe from `js.stripe.com`, so raw card
numbers never touch this origin, server or database. `next.config.ts`
allowlists exactly the three Stripe hosts that requires.

An order is marked PAID only after `paymentService.verifyPayment` confirms with
the gateway that the payment succeeded, is for at least the server-computed
total, is in the right currency, and has not already been applied to another
order. Providers without a verification path implemented are rejected outright
rather than trusted — Stripe, cash on delivery and bank transfer are wired end
to end; the rest store credentials but are not offered at checkout.

### Before launching commerce publicly

**Serve tenant storefronts from a separate registrable domain.** Today they
are `*.${ROOT_DOMAIN}`. Once merchants can inject JavaScript (custom code,
Liquid, analytics scripts), a tenant page can set cookies scoped to
`.${ROOT_DOMAIN}` and gains a same-site relationship with the dashboard.
Shopify uses `myshopify.com`, Vercel uses `vercel.app` — both separate
registrable domains on the Public Suffix List. Auth.js cookies are host-only
so sessions are not directly readable today, but this is far cheaper to fix
before customers have live URLs than after.

Also outstanding: `CanvasFrame`'s `message` handler does not check
`event.origin`, which must be tightened before the builder canvas renders
tenant Liquid.

## Server-side conversion tracking

A storefront that reports sales only from the browser reports a fraction of
them: ad blockers, tracking protection and abandoned tabs all silently remove
conversions, and an ad platform that cannot see a conversion cannot optimise
towards it. Every storefront event is therefore also sent from the server, from
`server/services/trackingService.ts`.

**Setup is two fields per platform**, under _Store → Settings → Integrations_:

| Platform                 | Needs                       | Where it comes from                                      |
| ------------------------ | --------------------------- | -------------------------------------------------------- |
| Meta Conversions API     | Pixel ID + access token     | Events Manager → your pixel → Settings → Conversions API |
| GA4 Measurement Protocol | Measurement ID + API secret | Admin → Data streams → Measurement Protocol API secrets  |

The token is the on-switch: with an id alone the browser tag behaves exactly as
it always has, and adding the secret turns on server-side reporting. Both
secrets are encrypted at rest with `AUTH_SECRET` (`lib/crypto.ts`) and are never
sent back to the browser. **Send test event** posts to both platforms and shows
what they said.

### Nothing is counted twice

The rule differs per platform because the platforms differ in what they can
deduplicate:

- **Meta** receives both copies, sharing one `event_id`, and collapses them.
  This is Meta's own recommended setup: the browser contributes cookies the
  server cannot see, the server contributes a verified order an ad blocker
  cannot suppress.
- **GA4** receives one copy, from the server only, because GA4 deduplicates
  nothing — two copies would be two conversions in the revenue report. `gtag`
  still loads (it owns the `_ga` cookies that let a server-reported sale join
  the session that produced it) but runs with `send_page_view: false`.

Beneath both, `TrackingDelivery` has a unique `(destination, dedupeKey)` index
keyed on the order id, so a double-tapped submit button, a replayed cart or an
overlapping retry sweep cannot queue a second send at all. The platforms' own
deduplication is the fallback, not the mechanism.

### Attribution

`proxy.ts` captures `fbclid` into a first-party `_fbc` cookie on the landing
request, and mints `_fbp` and a GA-shaped fallback client id. This is the only
point in the lifecycle that can do it — a Server Component cannot set cookies,
and `fbclid` is present on exactly one request. Without it, a purchase from an
ad click is unattributable, which defeats the point. Customer details from the
order (phone, name, city) are normalised and SHA-256 hashed for Meta's matching;
no plaintext buyer detail is ever stored in the queue or the delivery log.

Purchases are queued, retried and logged; page views are best-effort and are
not. A lost page view is noise, a lost purchase is the number the merchant makes
decisions with — and a row per page view per destination would be the largest
table in the database within a month. Retries need the
`/api/cron/tracking-retries` sweep (see `.env.example`).

## Deployment checklist

- Run `pnpm exec prisma migrate deploy` (not `migrate dev`) against the
  production database as part of your deploy step — it applies pending
  migrations without prompting or generating new ones.
- Uploads are proxied through the app server, so whatever sits in front of
  it must allow request bodies up to the 10MB media limit
  (`MAX_MEDIA_UPLOAD_BYTES`) on `/api/media/*`.
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

# ncom
