import type { Metadata } from 'next'
import Link from 'next/link'
import { auth } from '@/server/auth/auth'
import { env } from '@/lib/env'
import { Navbar } from '@/components/marketing/navbar'
import { Footer } from '@/components/marketing/footer'
import { CodeBlock } from '@/components/marketing/code-block'
import { API_SCOPES } from '@/server/services/apiKeyService'
import { WEBHOOK_TOPICS } from '@/server/services/webhookService'

export const metadata: Metadata = {
  title: 'Product source & API — NCOM developer documentation',
  description:
    'Connect your website so NCOM reads your products, prices and stock live on every request, read orders back, and receive signed webhooks.',
}

/**
 * The public developer documentation.
 *
 * Deliberately one long page rather than a nested docs site. Someone connecting
 * an existing shop reads this once, start to finish, with a terminal open — and
 * a single page is searchable with ⌘F, printable, and linkable to any heading.
 * Splitting it into twelve routes optimises for a reader who is browsing, and
 * nobody browses integration docs.
 *
 * The Product source section is the important one and is placed before the REST
 * API for that reason: it is what a merchant has to build, and everything else
 * here is optional next to it. The catalogue endpoints this page used to
 * document — products, categories, inventory, the importer — are retired and
 * answer 410; the model they belonged to is described in the section that
 * replaced them.
 *
 * The scope and topic tables are generated from the same constants the server
 * enforces, so a permission renamed in code cannot go on being documented under
 * its old name.
 */

const NAV_SECTIONS = [
  { id: 'quickstart', label: 'Quickstart' },
  { id: 'authentication', label: 'Authentication' },
  { id: 'conventions', label: 'Conventions' },
  { id: 'product-source', label: 'Product source' },
  { id: 'orders', label: 'Orders' },
  { id: 'courier', label: 'Courier automation' },
  { id: 'webhooks', label: 'Webhooks' },
  { id: 'errors', label: 'Errors & limits' },
]

export default async function DocsPage() {
  const session = await auth()
  const baseUrl = env.AUTH_URL.replace(/\/$/, '')

  return (
    <div className="flex flex-1 flex-col">
      <Navbar isSignedIn={Boolean(session?.user)} />

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-12 sm:px-10">
        <header className="mb-10 max-w-3xl">
          <p className="eyebrow text-muted-foreground">
            Developer documentation
          </p>
          <h1 className="font-display mt-2 text-4xl font-semibold tracking-tight sm:text-5xl">
            Product source &amp; API
          </h1>
          <p className="text-muted-foreground mt-4 text-lg">
            Your website keeps your catalogue. NCOM reads it live — on every
            page view, every cart and every checkout — and never stores a copy.
            This page is how to build the endpoint it reads. Every code sample
            is copyable.
          </p>
        </header>

        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_14rem] lg:gap-12">
          <article className="prose-docs min-w-0">
            <Section id="quickstart" title="Quickstart">
              <P>
                There are two separate things here, and only the first one is
                required.
              </P>

              <Ol>
                <li>
                  <strong>Connect your website as the product source.</strong>{' '}
                  Deploy the connector endpoints described below, paste the URL
                  into <strong>Settings → Product source</strong>, and your
                  catalogue is live on every landing page. Nothing is imported.
                  About an hour of work, most of it copying one of the reference
                  implementations.
                </li>
                <li>
                  <strong>Optionally, use the REST API</strong> to read orders
                  back into your own system, or take webhooks when one is
                  placed. Create a key under{' '}
                  <strong>Developers → API keys</strong> and confirm it with{' '}
                  <Code>GET /api/v1/me</Code>.
                </li>
              </Ol>

              <Callout title="If you built an importer for an older version of this platform, switch it off">
                <Code>POST /api/v1/products/import</Code>,{' '}
                <Code>/api/v1/products</Code>, <Code>/api/v1/categories</Code>{' '}
                and <Code>/api/v1/inventory</Code> are retired and answer{' '}
                <Code>410 Gone</Code>. Nothing needs to replace the sync — that
                is the point of reading live. Connect a product source instead.
              </Callout>

              <CodeBlock
                title="Check your key"
                language="bash"
                code={`curl ${baseUrl}/api/v1/me \\
  -H "Authorization: Bearer $NCOM_API_KEY"`}
              />

              <CodeBlock
                title="Response"
                language="json"
                code={`{
  "data": {
    "organization": {
      "id": "clx8f2k9v0000",
      "name": "Elysium",
      "slug": "elysium",
      "currencyCode": "BDT",
      "currencyConfigured": true,
      "weightUnit": "GRAM",
      "weightsAreAlwaysInGrams": true
    },
    "key": {
      "id": "clx8f3m1a0001",
      "name": "Order export",
      "scopes": ["ORDERS_READ"]
    }
  }
}`}
              />

              <Callout title="Set your currency before connecting a shop">
                Prices read from your website are interpreted in the workspace
                currency, and nothing downstream can detect a mismatch. If{' '}
                <Code>currencyConfigured</Code> is <Code>false</Code>, the
                workspace is still on a default nobody chose — set it under
                Settings first. The connection panel compares your site&apos;s
                reported currency against it and warns rather than converting.
              </Callout>
            </Section>

            <Section id="authentication" title="Authentication">
              <P>
                Send your key as a bearer token on every request. The header
                <Code>X-API-Key</Code> is accepted too, if that is easier in
                your HTTP client.
              </P>

              <CodeBlock
                language="bash"
                code={`# Either of these works
curl ${baseUrl}/api/v1/products \\
  -H "Authorization: Bearer ncom_live_7f3a9c21.xxxxxxxxxxxx"

curl ${baseUrl}/api/v1/products \\
  -H "X-API-Key: ncom_live_7f3a9c21.xxxxxxxxxxxx"`}
              />

              <Callout title="Keys are shown once">
                We store only a hash of your key, so we cannot show it to you
                again or recover it for you. If you lose one, revoke it and
                create another. Never put a key in front-end code — anything in
                a browser is public, and a key with write permissions can change
                your prices and your stock.
              </Callout>

              <H3>Permissions</H3>
              <P>
                A key carries only the permissions you tick when you create it.
                Give an importer write access and give a stock reader read
                access; a key that can do everything is a key that can destroy
                everything if it leaks.
              </P>

              <Table
                head={['Permission', 'What it allows']}
                rows={API_SCOPES.map((scope) => [
                  <code key={scope.scope} className="font-mono text-xs">
                    {scope.scope}
                  </code>,
                  scope.description,
                ])}
              />
            </Section>

            <Section id="conventions" title="Conventions">
              <Ul>
                <li>
                  <strong>Base URL</strong> — <Code>{baseUrl}/api/v1</Code>
                </li>
                <li>
                  <strong>Money is always in minor units.</strong>{' '}
                  <Code>priceCents: 1299</Code> is 12.99 in your workspace
                  currency. No endpoint accepts or returns a decimal price, so
                  rounding never happens twice.
                </li>
                <li>
                  <strong>Successful responses are wrapped in</strong>{' '}
                  <Code>{'{ "data": … }'}</Code>. List responses add a{' '}
                  <Code>pagination</Code> object.
                </li>
                <li>
                  <strong>Errors are</strong>{' '}
                  <Code>{'{ "error": { "code", "message" } }'}</Code>. Branch on{' '}
                  <Code>code</Code>, never on the message text — messages get
                  reworded, codes do not.
                </li>
                <li>
                  <strong>Paging</strong> — <Code>?page=1&amp;limit=50</Code>,
                  limit capped at 250.
                </li>
                <li>
                  <strong>Weights are always grams.</strong>{' '}
                  <Code>weightGrams</Code> means grams on every request and
                  every response, whatever <Code>/me</Code> reports for{' '}
                  <Code>weightUnit</Code> — that is a display preference for the
                  dashboard and for shipping labels, and it never reinterprets a
                  stored value. A 1.2&nbsp;kg parcel is always{' '}
                  <Code>{'"weightGrams": 1200'}</Code>.
                </li>
                <li>
                  <strong>Timestamps</strong> are ISO 8601 in UTC. Filters that
                  take one (<Code>updatedSince</Code>) accept any ISO 8601
                  string and reject anything else rather than ignoring it.
                </li>
              </Ul>

              <CodeBlock
                title="List response shape"
                language="json"
                code={`{
  "data": [ /* … */ ],
  "pagination": { "page": 1, "limit": 50, "total": 412, "hasMore": true }
}`}
              />
            </Section>

            <Section id="product-source" title="Product source">
              <P>
                This is the part to read first, because everything else on this
                page assumes it. NCOM does not store your catalogue. There is no
                product table, no stock table and no copy of your photographs.
                When a shopper opens one of your landing pages, NCOM asks your
                website what you sell, what it costs and how many are left, and
                renders the answer.
              </P>

              <P>
                So there is nothing to import and no sync to keep running. What
                you build instead is one small read-only endpoint group on your
                own site, and NCOM calls it.
              </P>

              <Callout title="What you get for it">
                A price you change at 3pm is the price on every landing page at
                3pm. A product you unpublish stops being sold. Stock is your
                stock, in your database, counted once. Nothing drifts, because
                there is no second copy to drift from.
              </Callout>

              <H3>What you have to build</H3>

              <P>
                Everything hangs off a base URL you choose, for example{' '}
                <Code>https://yourshop.com/ncom/v1</Code>. Enter it in{' '}
                <strong>Settings → Product source</strong>.
              </P>

              <EndpointTable
                rows={[
                  [
                    'GET',
                    '{base}/ping',
                    'Required. Handshake: who you are and what you implement',
                  ],
                  ['GET', '{base}/products', 'Required. A page of products'],
                  [
                    'GET',
                    '{base}/products/{id}',
                    'Required. One product, by id or handle',
                  ],
                  [
                    'POST',
                    '{base}/stock',
                    'Recommended. Current stock for a list of variants',
                  ],
                  ['GET', '{base}/categories', 'Optional. Your browse tree'],
                  [
                    'POST',
                    '{base}/reserve',
                    'Optional. Hold units for an order',
                  ],
                  ['POST', '{base}/release', 'Optional. Give held units back'],
                ]}
              />

              <P>
                The shortest honest implementation is about 120 lines. Three
                working ones are in the <Code>connectors/</Code> directory of
                the NCOM repository: a WooCommerce plugin that needs no SQL at
                all, a plain PHP + PDO file, and an Express router. Copy the
                closest one and rename the columns.
              </P>

              <H3>Authentication</H3>

              <P>
                Every request NCOM makes is signed with a secret generated when
                you connect and shown exactly once. Your endpoint verifies it
                and refuses everything else — it exposes your prices, your
                drafts and your stock, and on sites that implement{' '}
                <Code>/reserve</Code> it can move that stock.
              </P>

              <CodeBlock
                title="Headers on every request"
                language="http"
                code={`X-NCOM-Key:       ncomcat_9f2b1c4d7e08
X-NCOM-Contract:  1
X-NCOM-Timestamp: 1772630400
X-NCOM-Signature: t=1772630400,v1=6f1d…c3
User-Agent:       NCOM-Catalog/1`}
              />

              <P>
                The signature is{' '}
                <Code>
                  hmac_sha256(secret, timestamp + &quot;.&quot; + raw body)
                </Code>{' '}
                in hex. The body is the exact bytes sent, and the empty string
                for every GET. Reject a timestamp more than five minutes from
                your own clock, and compare in constant time.
              </P>

              <Callout title="You may already have this function">
                It is byte-for-byte the scheme NCOM signs outgoing webhooks
                with. If you verify our webhooks today, paste the same function
                here and change nothing.
              </Callout>

              <CodeBlock
                title="Verifying, in PHP"
                language="php"
                code={`$parts = [];
foreach (explode(',', $_SERVER['HTTP_X_NCOM_SIGNATURE'] ?? '') as $piece) {
    [$k, $v] = array_pad(explode('=', trim($piece), 2), 2, '');
    $parts[$k] = $v;
}

$timestamp = (int) ($parts['t'] ?? 0);
$body = file_get_contents('php://input') ?: '';

if (abs(time() - $timestamp) > 300) {
    http_response_code(401);
    exit;
}

$expected = hash_hmac('sha256', $timestamp . '.' . $body, NCOM_SECRET);

if (!hash_equals($expected, $parts['v1'] ?? '')) {
    http_response_code(401);
    exit;
}`}
              />

              <CodeBlock
                title="Verifying, in Node"
                language="javascript"
                code={`const crypto = require('node:crypto')

function verify(req, rawBody, secret) {
  const parts = Object.fromEntries(
    String(req.headers['x-ncom-signature'] ?? '')
      .split(',')
      .map((piece) => {
        const [key, ...rest] = piece.trim().split('=')
        return [key, rest.join('=')]
      })
  )

  const timestamp = Number(parts.t)
  if (Math.abs(Date.now() / 1000 - timestamp) > 300) return false

  const expected = crypto
    .createHmac('sha256', secret)
    .update(\`\${timestamp}.\${rawBody}\`)
    .digest('hex')

  const a = Buffer.from(expected)
  const b = Buffer.from(String(parts.v1 ?? ''))
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}`}
              />

              <H3>The handshake</H3>

              <P>
                <Code>GET {'{base}'}/ping</Code> is called when you press Test,
                never while a shopper is waiting. Tell the truth in{' '}
                <Code>capabilities</Code>: NCOM shows the merchant exactly what
                their site can do, and claiming something you have not built
                turns a clear warning into a mysterious checkout failure.
              </P>

              <CodeBlock
                title="GET {base}/ping"
                language="json"
                code={`{
  "ok": true,
  "contract": "1",
  "platform": "woocommerce/8.6",
  "currency": "BDT",
  "capabilities": {
    "products": true,
    "stock": true,
    "search": true,
    "categories": false,
    "reserve": true,
    "release": true
  }
}`}
              />

              <Callout title="Currency is compared, never converted">
                If your site quotes USD and the workspace sells in BDT, the
                connection panel says so and nothing tries to reconcile it.
                Reading a price as one currency and charging it as another is a
                hundredfold error, so it is reported and left to a human.
              </Callout>

              <H3>Listing products</H3>

              <P>
                <Code>GET {'{base}'}/products</Code> takes <Code>limit</Code>{' '}
                (1–100), <Code>cursor</Code>, <Code>q</Code>,{' '}
                <Code>category</Code>, <Code>status</Code> and <Code>ids</Code>.
                Return <Code>nextCursor</Code> — anything opaque you can page
                from — or <Code>null</Code> when there are no more.
              </P>

              <Callout title="Honour ids before anything else">
                It is how NCOM re-reads the exact products a saved offer names,
                on every render of that landing page. A connector that ignores{' '}
                <Code>ids</Code> and returns its first page instead makes an
                offer appear to sell the wrong things.
              </Callout>

              <CodeBlock
                title="GET {base}/products?limit=2"
                language="json"
                code={`{
  "products": [
    {
      "id": "42",
      "handle": "classic-tee",
      "title": "Classic Tee",
      "status": "active",
      "description": "Soft cotton, boxy fit.",
      "vendor": "Acme",
      "categoryId": "12",
      "url": "https://yourshop.com/product/classic-tee",
      "images": [
        { "url": "https://yourshop.com/img/tee.jpg", "alt": "Classic tee" }
      ],
      "options": [{ "name": "Size", "values": ["S", "M", "L"] }],
      "variants": [
        {
          "id": "4201",
          "title": "M",
          "sku": "TEE-M",
          "price": "1250.00",
          "compareAtPrice": "1500.00",
          "options": ["M"],
          "available": 12,
          "policy": "deny",
          "requiresShipping": true,
          "weightGrams": 220
        }
      ]
    }
  ],
  "nextCursor": "eyJpZCI6MTI4fQ",
  "total": 412
}`}
              />

              <H3>The rules that matter</H3>

              <Table
                head={['Field', 'What NCOM does with it']}
                rows={[
                  [
                    <Code key="id">id</Code>,
                    'Your own id — a post id, a UUID, a SKU. It is what offers, carts and order lines store, so it has to be stable. An id that changes is a saved offer that stops resolving. Numbers and strings are the same thing here.',
                  ],
                  [
                    <Code key="price">price</Code>,
                    <>
                      A decimal string or number (
                      <Code>&quot;1250.00&quot;</Code>
                      ), or send <Code>priceCents</Code> as an integer in minor
                      units. Send the price a customer pays, tax included if
                      your shop quotes it that way. Never send cost prices —
                      there is no field for them.
                    </>,
                  ],
                  [
                    <Code key="status">status</Code>,
                    <>
                      <Code>active</Code>, <Code>draft</Code> or{' '}
                      <Code>archived</Code>; WordPress statuses are understood.
                      Only active products can be sold. Drafts appear in the
                      dashboard so a page can be built before publishing.
                    </>,
                  ],
                  [
                    <Code key="available">available</Code>,
                    <>
                      A number is used as-is. <Code>tracked: false</Code> means
                      you do not count this line and it is always sellable.{' '}
                      <Code>inStock: false</Code> is a hard zero. Sending
                      nothing at all means not counted — silence is not read as
                      sold out.
                    </>,
                  ],
                  [
                    <Code key="policy">policy</Code>,
                    <>
                      <Code>deny</Code> stops selling at zero,{' '}
                      <Code>continue</Code> allows backorders.
                    </>,
                  ],
                  [
                    <Code key="images">images</Code>,
                    'Absolute URLs on your own site or CDN, over HTTPS. NCOM never downloads or re-hosts them — the landing page points at your server. Objects or bare URL strings both work.',
                  ],
                  [
                    <Code key="variants">variants</Code>,
                    'Omit it entirely for a simple product: put price, sku and available on the product itself and NCOM synthesises one variant whose id is the product id.',
                  ],
                ]}
              />

              <Callout title="snake_case or camelCase, whichever you already have">
                <Code>stock_quantity</Code> and <Code>stockQuantity</Code> are
                the same field, everywhere. Write what your platform already
                produces rather than converting it.
              </Callout>

              <H3>Stock</H3>

              <P>
                <Code>POST {'{base}'}/stock</Code> is the hot endpoint: it is
                called on every cart render and again inside every checkout.
                Keep it to one indexed query.
              </P>

              <CodeBlock
                title="POST {base}/stock"
                language="json"
                code={`// request
{ "ids": ["4201", "4202", "4203"] }

// response
{ "stock": [
    { "id": "4201", "available": 12, "policy": "deny" },
    { "id": "4202", "available": 0,  "policy": "continue" },
    { "id": "4203", "available": null }
] }`}
              />

              <H3>Holding stock for an order</H3>

              <P>
                <Code>/reserve</Code> and <Code>/release</Code> are optional,
                and the choice to implement them is the most consequential one
                on this page.
              </P>

              <Ul>
                <li>
                  <strong>With them.</strong> NCOM asks your site to take the
                  units before it writes the order, and hands them back if
                  writing fails. Two shoppers cannot buy the same last unit,
                  because your database decides which of them gets it.
                </li>
                <li>
                  <strong>Without them.</strong> NCOM checks stock moments
                  before writing the order and no more. Two shoppers reaching
                  the last unit in the same second both get an order, and you
                  sort it out — exactly as you did before you had NCOM.
                </li>
              </Ul>

              <P>
                Both are legitimate ways to run a shop. Your dashboard says
                which mode you are in, on the Product source screen, so nobody
                has to discover it during a sale.
              </P>

              <CodeBlock
                title="POST {base}/reserve"
                language="json"
                code={`// request
{ "orderRef": "clz3k8x…", "lines": [ { "variantId": "4201", "quantity": 2 } ] }

// held
{ "ok": true }

// refused — the order is not written, and the shopper is told why
{ "ok": false, "rejected": [ { "variantId": "4201", "reason": "Only 1 left" } ] }`}
              />

              <Callout title="Take the units conditionally, in one statement">
                The shape is{' '}
                <Code>
                  UPDATE … SET stock = stock - :n WHERE id = :id AND stock &gt;=
                  :n
                </Code>{' '}
                and a row count of zero is the refusal. Reading the stock first
                and then writing it — the obvious implementation — lets two
                checkouts both see the last unit and both succeed.
              </Callout>

              <P>
                <Code>orderRef</Code> is stable for a checkout and is repeated
                on the matching <Code>/release</Code>, so an implementation can
                be idempotent on it. A release arrives when an order is
                cancelled, when a parcel comes back, and when a checkout failed
                after the hold.
              </P>

              <H3>When your site cannot answer</H3>

              <Table
                head={['Situation', 'What a shopper sees']}
                rows={[
                  [
                    'Unreachable or timed out',
                    'The landing page still renders. The order form says ordering is unavailable for a moment. Checkout refuses. Your dashboard shows the reason.',
                  ],
                  [
                    '401 from your endpoint',
                    'The same, and the dashboard says the key or the clock is wrong.',
                  ],
                  [
                    'HTML instead of JSON',
                    'Reported as a base URL pointing at a web page rather than a connector. This is the most common first-time mistake.',
                  ],
                  [
                    'A product in an offer is missing or draft',
                    'That offer is hidden from the page. The Offers screen names the product id.',
                  ],
                  [
                    'Everything is out of stock',
                    'The offer still shows, marked sold out. Checkout refuses it.',
                  ],
                  [
                    'Stock ran out mid-checkout',
                    'The order is refused with "sold out while you were checking out".',
                  ],
                ]}
              />

              <P>
                The rule throughout: when the catalogue cannot be read, NCOM
                refuses to sell rather than guessing.
              </P>

              <H3>Performance</H3>

              <P>
                There is no cache. Not in Redis, not in the page, not for five
                seconds — every read is <Code>no-store</Code> and every value
                dies with the request that fetched it. A five-second cache is a
                stored catalogue with a short attention span, and a stored
                catalogue is what this design exists to remove.
              </P>

              <P>What NCOM does instead, to keep your server comfortable:</P>

              <Ul>
                <li>
                  One request per distinct question per render. A page with six
                  offers over four products makes one products call, not six.
                </li>
                <li>Ids are batched fifty at a time.</li>
                <li>
                  A page may reference at most 200 products; the stock screen
                  reads at most 1,000 and says so when it stops.
                </li>
                <li>
                  Every call times out — 4 seconds by default, adjustable
                  between 1 and 10. A shopper is waiting on the other end.
                </li>
              </Ul>

              <P>
                On your side: serve <Code>/products</Code> and{' '}
                <Code>/stock</Code> from an index rather than a scan, allow our
                requests through any rate limiter (a <Code>429</Code> shows as
                gaps in the storefront), and cache on your own side if you like
                — you know when your data changes and can invalidate correctly,
                which is exactly what NCOM cannot do from here.
              </P>

              <H3>Going live</H3>

              <Ol>
                <li>
                  Deploy the connector at a public HTTPS URL. Plain{' '}
                  <Code>http://</Code> is refused.
                </li>
                <li>
                  <strong>Settings → Product source</strong>, paste the base
                  URL, press Connect.
                </li>
                <li>
                  Copy the key id and secret into your connector. They are shown
                  once.
                </li>
                <li>
                  Press Test. The panel reports your platform, your currency and
                  every capability it found.
                </li>
                <li>
                  Open <strong>Products</strong>. Your catalogue is there, read
                  live.
                </li>
                <li>
                  Change a price on your shop and reload the landing page. It
                  changes. That is the whole system, demonstrated in ten
                  seconds.
                </li>
                <li>
                  Place one real order, and confirm your own stock moved by
                  exactly what was sold.
                </li>
              </Ol>

              <P>
                Before going live, run the conformance checker against your
                connector. It exercises every endpoint here and reports what it
                found — which capabilities you declare, whether you honour{' '}
                <Code>ids</Code>, whether a missing product answers 404, what
                your stock endpoint says, and whether <Code>/reserve</Code>{' '}
                refuses an impossible quantity.
              </P>

              <CodeBlock
                title="Checking a connector"
                language="bash"
                code={`pnpm check:connector -- \\
  --url https://yourshop.com/ncom/v1 \\
  --key ncomcat_… --secret ncomsec_…`}
              />

              <CodeBlock
                title="Testing the handshake by hand"
                language="bash"
                code={`BASE="https://yourshop.com/ncom/v1"
KEY="ncomcat_…"
SECRET="ncomsec_…"

T=$(date +%s)
SIG=$(printf '%s.' "$T" | openssl dgst -sha256 -hmac "$SECRET" -hex | sed 's/^.* //')

curl -s "$BASE/ping" \\
  -H "X-NCOM-Key: $KEY" \\
  -H "X-NCOM-Contract: 1" \\
  -H "X-NCOM-Timestamp: $T" \\
  -H "X-NCOM-Signature: t=$T,v1=$SIG" | jq`}
              />

              <P>
                For a GET the signed body is the empty string, which is why the{' '}
                <Code>printf</Code> ends at the dot.
              </P>

              <H3>What NCOM still stores</H3>

              <P>
                To be exact about where the line falls. Read from your website
                and never stored: products, titles, descriptions, handles,
                prices, options, variants, SKUs, barcodes, weights, images,
                stock levels, backorder policy, categories.
              </P>

              <P>
                Stored by NCOM because NCOM produced it: landing pages and their
                design, offers and bundle pricing (which reference your ids),
                carts, orders and order lines, customers, discounts, delivery
                zones, courier shipments, and your connection settings.
              </P>

              <Callout title="Order lines are a record, not a cache">
                An order line copies the title, price, SKU, weight and image URL
                at the moment of sale. That is not a stored catalogue — it is
                what was sold, at what price, to whom. Delete the product
                tonight and last March&apos;s order still reads correctly, which
                is precisely why the copy is taken.
              </Callout>
            </Section>

            <Section id="orders" title="Orders">
              <EndpointTable
                rows={[
                  ['GET', '/api/v1/orders', 'List orders, newest first'],
                  ['GET', '/api/v1/orders/{id}', 'One order with its lines'],
                ]}
              />

              <P>
                Orders are read-only over the API. Refunds, fulfilments and
                cancellations are recorded against the person who performed them
                and show up in the order&rsquo;s timeline — an API key is not a
                person, so exposing those would either put a fiction in that
                record or leave it blank on exactly the events where &ldquo;who
                did this&rdquo; matters most. Subscribe to the order webhooks
                below to react to orders as they happen.
              </P>
            </Section>

            <Section id="courier" title="Courier automation">
              <P>
                Orders placed cash on delivery are screened against the
                customer&rsquo;s courier delivery history before anything is
                shipped, and — if they clear the thresholds you set — handed to
                Steadfast or Pathao without anyone touching them. Everything
                after that is driven by the couriers&rsquo; own callbacks.
              </P>

              <H3>The pipeline</H3>
              <Table
                head={['State', 'What it means']}
                rows={[
                  [
                    <Code key="pending">pending</Code>,
                    'Placed. Either not screened yet, or screened clean while automatic dispatch is off.',
                  ],
                  [
                    <Code key="review">fraud_review</Code>,
                    'Failed a threshold, or could not be screened. Waits for an admin or moderator to release or refuse it.',
                  ],
                  [
                    <Code key="processing">processing</Code>,
                    'Cleared for shipping and queued for the courier. The only state that dispatches.',
                  ],
                  [
                    <Code key="dispatched">dispatched</Code>,
                    'A consignment exists at the courier.',
                  ],
                  [
                    <Code key="transit">in_transit / out_for_delivery</Code>,
                    'Driven by courier callbacks.',
                  ],
                  [
                    <Code key="delivered">delivered</Code>,
                    'Arrived. Cash collected at the door is recorded against the order automatically.',
                  ],
                  [
                    <Code key="returned">returned</Code>,
                    'Came back. Stock is returned to inventory automatically.',
                  ],
                ]}
              />

              <H3>Two different Steadfast credentials</H3>
              <P>
                Screening and shipping use separate accounts, and having one
                does not give you the other:
              </P>
              <Table
                head={['Credential', 'What it does']}
                rows={[
                  [
                    <strong key="api">API key + secret</strong>,
                    'Creates consignments. One per workspace, under Courier accounts.',
                  ],
                  [
                    <strong key="portal">Merchant portal logins</strong>,
                    'Read a customer’s delivery history for screening. Add several — the portal rate limits and locks accounts, and lookups fail over between them.',
                  ],
                ]}
              />

              <H3>Screening thresholds</H3>
              <P>
                Set these under <strong>Setup → Courier &amp; fraud</strong>. An
                order clears only if the customer passes every rule — this is an
                AND, not a score, so the reason shown on a held order names the
                one rule that actually stopped it.
              </P>
              <Ul>
                <li>
                  <strong>Minimum parcels in history</strong> — how much the
                  courier knows about this number at all.
                </li>
                <li>
                  <strong>Minimum successful deliveries</strong> — how many of
                  those actually arrived.
                </li>
                <li>
                  <strong>Minimum delivery rate</strong> — delivered as a share
                  of every parcel. Set 0 to judge on the counts alone.
                </li>
                <li>
                  <strong>Fraud reports allowed</strong> — the only rule that
                  fails an order outright rather than holding it for review.
                </li>
              </Ul>

              <Callout title="Why there are two count rules, not one">
                A rate computed from one parcel is 100%, and from two is either
                100% or 50% — so a rate threshold alone waves through every
                customer with almost no history. But history alone is not enough
                either: 20 parcels of which 2 arrived is plenty of history and a
                customer worth refusing. The two counts answer different
                questions, so they are set separately.
              </Callout>

              <H3>Receiving parcel updates</H3>
              <P>
                Each connected courier gets its own callback URL containing an
                unguessable token, shown in courier settings. Paste it into the
                courier&rsquo;s merchant panel — Steadfast under webhook
                settings, Pathao under Webhook with all events selected. Without
                it parcels dispatch normally and then never update again.
              </P>
              <P>
                A scheduled sweep polls the couriers about any parcel that has
                gone quiet for 90 minutes, because a dropped webhook is silent
                by nature. Point a cron job at{' '}
                <Code>/api/cron/courier-sync</Code> every five minutes, with the{' '}
                <Code>CRON_SECRET</Code> bearer token.
              </P>

              <H3>Reacting to parcels from your own systems</H3>
              <P>
                The <Code>shipment.*</Code> and{' '}
                <Code>order.held_for_review</Code> topics below carry the same
                events into your webhook endpoints, so an ERP or a support desk
                can follow parcels without polling.
              </P>
              <CodeBlock
                title="shipment.delivered"
                language="json"
                code={`{
  "id": "evt_1c4e9b02f7a3d685",
  "topic": "shipment.delivered",
  "createdAt": "2026-08-14T09:12:44.115Z",
  "organizationId": "clx8f2k9v0000",
  "data": {
    "id": "clx8ship0001",
    "orderId": "clx8order0001",
    "orderNumber": "#1042",
    "provider": "steadfast",
    "status": "delivered",
    "courierStatus": "delivered",
    "message": "Steadfast reports delivered",
    "consignmentId": "1424107",
    "trackingCode": "15BAEB8A",
    "trackingUrl": "https://steadfast.com.bd/t/15BAEB8A",
    "codAmountCents": 106000,
    "collectedAmountCents": 106000,
    "deliveryFeeCents": 6000,
    "dispatchedAt": "2026-08-12T06:31:02.000Z",
    "deliveredAt": "2026-08-14T09:12:30.000Z"
  }
}`}
              />
            </Section>

            <Section id="webhooks" title="Webhooks">
              <P>
                Register an endpoint and we will POST a signed JSON body to it
                whenever something changes. This is how the other side of your
                setup learns that stock moved without polling for it.
              </P>

              <P>
                Add endpoints in <strong>Developers → Webhooks</strong>, or over
                the API — which is what an installable integration should do, so
                the merchant does not have to paste a URL into two dashboards to
                finish connecting.
              </P>

              <H3>Managing endpoints</H3>
              <EndpointTable
                rows={[
                  [
                    'GET',
                    '/api/v1/webhooks',
                    'List endpoints and their delivery counts',
                  ],
                  ['POST', '/api/v1/webhooks', 'Register an endpoint'],
                  [
                    'PATCH',
                    '/api/v1/webhooks/{id}',
                    'Change URL, topics, or pause it',
                  ],
                  ['DELETE', '/api/v1/webhooks/{id}', 'Remove an endpoint'],
                ]}
              />

              <P>
                Topics are given as the dotted strings from the table below —
                the same values that arrive in the payload&rsquo;s{' '}
                <Code>topic</Code> field, so there is only ever one vocabulary
                to know. Requires <Code>WEBHOOKS_READ</Code> to list and{' '}
                <Code>WEBHOOKS_WRITE</Code> to change.
              </P>

              <CodeBlock
                title="POST /api/v1/webhooks"
                language="bash"
                code={`curl -X POST ${baseUrl}/api/v1/webhooks \\
  -H "Authorization: Bearer $NCOM_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "https://yourshop.com/api/ncom-webhook",
    "description": "Main site stock sync",
    "topics": ["inventory.updated", "product.updated", "order.created"]
  }'`}
              />

              <CodeBlock
                title="Response — the signing secret is here and nowhere else"
                language="json"
                code={`201 {
  "data": {
    "id": "clx8hook0001",
    "url": "https://yourshop.com/api/ncom-webhook",
    "topics": ["inventory.updated", "product.updated", "order.created"],
    "secret": "whsec_9f2c1a7b4d8e0f31a6c5"
  }
}`}
              />

              <Callout title="Store the secret when you create the endpoint">
                <Code>secret</Code> is returned only in this response. It is
                stored encrypted so it can sign every delivery, but it is never
                returned again by <Code>GET /api/v1/webhooks</Code> or shown a
                second time in the dashboard. If you lose it, rotate it from{' '}
                <strong>Developers → Webhooks</strong> — the old one stops
                working immediately, so update your receiver first.
              </Callout>

              <CodeBlock
                title="Listing, and pausing one"
                language="bash"
                code={`curl ${baseUrl}/api/v1/webhooks \\
  -H "Authorization: Bearer $NCOM_API_KEY"

# 200 {"data":[{"id":"clx8hook0001","url":"…","topics":["inventory.updated"],
#               "isActive":true,
#               "deliveries":{"succeeded":412,"failed":0,"pending":0},
#               "lastSuccessAt":"2026-08-14T09:12:04.221Z"}]}
#
# Note there is no "secret" field — it is write-only.

curl -X PATCH ${baseUrl}/api/v1/webhooks/clx8hook0001 \\
  -H "Authorization: Bearer $NCOM_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "isActive": false }'`}
              />

              <H3>Events</H3>
              <Table
                head={['Topic', 'Sent when']}
                rows={WEBHOOK_TOPICS.map((topic) => [
                  <code key={topic.wire} className="font-mono text-xs">
                    {topic.wire}
                  </code>,
                  topic.description,
                ])}
              />

              <H3>What arrives</H3>
              <CodeBlock
                title="POST https://yourshop.com/api/ncom-webhook"
                language="json"
                code={`{
  "id": "evt_9f2c1a7b4d8e0f31",
  "topic": "inventory.updated",
  "createdAt": "2026-08-13T10:24:11.482Z",
  "organizationId": "clx8f2k9v0000",
  "data": {
    "product": { "id": "clx8product0001", "title": "Classic Cotton Tee", "handle": "classic-cotton-tee" },
    "variant": { "id": "clx8variant0001", "sku": "TEE-M", "title": "M", "inventoryPolicy": "DENY" },
    "available": 3,
    "committed": 2,
    "locations": [
      { "id": "clx8loc0001", "name": "Main warehouse", "available": 3, "committed": 2 }
    ]
  }
}`}
              />

              <H3>Headers</H3>
              <Table
                head={['Header', 'Meaning']}
                rows={[
                  [
                    <code key="sig" className="font-mono text-xs">
                      X-NCOM-Signature
                    </code>,
                    <>
                      <code className="font-mono text-xs">
                        t=&lt;unix&gt;,v1=&lt;hex&gt;
                      </code>{' '}
                      — HMAC-SHA256 of{' '}
                      <code className="font-mono text-xs">
                        &lt;t&gt;.&lt;raw body&gt;
                      </code>
                    </>,
                  ],
                  [
                    <code key="topic" className="font-mono text-xs">
                      X-NCOM-Topic
                    </code>,
                    'The topic, e.g. inventory.updated',
                  ],
                  [
                    <code key="event" className="font-mono text-xs">
                      X-NCOM-Event-Id
                    </code>,
                    'Stable across retries and across endpoints — deduplicate on this',
                  ],
                  [
                    <code key="attempt" className="font-mono text-xs">
                      X-NCOM-Attempt
                    </code>,
                    'Which attempt this is, starting at 1',
                  ],
                ]}
              />

              <H3>Verifying the signature</H3>
              <Callout title="Verify before you trust">
                Your webhook URL is not a secret — it appears in logs, proxies
                and browser history. Without checking the signature, anyone who
                learns the URL can post fake stock updates to your shop. Compare
                digests in constant time, and reject anything older than five
                minutes so a captured request cannot be replayed later.
              </Callout>

              <CodeBlock
                title="Node.js (Express)"
                language="javascript"
                code={`import crypto from 'node:crypto'
import express from 'express'

const app = express()
const SECRET = process.env.NCOM_WEBHOOK_SECRET

// The raw body is required — JSON.parse then re-stringify produces different
// bytes and the signature will never match.
app.post('/api/ncom-webhook',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    const header = req.get('X-NCOM-Signature') ?? ''
    const parts = Object.fromEntries(
      header.split(',').map((piece) => piece.trim().split('='))
    )

    const timestamp = Number(parts.t)
    if (!Number.isFinite(timestamp)) return res.sendStatus(400)

    // Reject replays of a captured request.
    if (Math.abs(Date.now() / 1000 - timestamp) > 300) return res.sendStatus(400)

    // Fed as bytes, not through a template string. Interpolating req.body
    // stringifies the Buffer implicitly, which happens to work for UTF-8 JSON
    // and stops working the moment a payload carries anything else — the kind
    // of bug that appears months later on one product with an unusual title.
    const expected = crypto
      .createHmac('sha256', SECRET)
      .update(Buffer.concat([Buffer.from(\`\${timestamp}.\`), req.body]))
      .digest('hex')

    const a = Buffer.from(expected, 'hex')
    const b = Buffer.from(parts.v1 ?? '', 'hex')
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return res.sendStatus(401)
    }

    const event = JSON.parse(req.body.toString())

    // Deduplicate: delivery is at-least-once, so you will occasionally see the
    // same event twice.
    if (alreadyProcessed(event.id)) return res.sendStatus(200)

    switch (event.topic) {
      case 'inventory.updated':
        updateLocalStock(event.data.variant.sku, event.data.available)
        break
      case 'product.updated':
        upsertLocalProduct(event.data)
        break
      case 'product.deleted':
        removeLocalProduct(event.data.externalId ?? event.data.id)
        break
      case 'order.created':
        reserveStockLocally(event.data.lines)
        break
    }

    markProcessed(event.id)

    // Answer 2xx quickly and do the slow work afterwards — we retry anything
    // that does not respond within 10 seconds.
    res.sendStatus(200)
  }
)`}
              />

              <CodeBlock
                title="PHP (Laravel)"
                language="php"
                code={`<?php

public function handle(Request $request)
{
    $secret = env('NCOM_WEBHOOK_SECRET');
    $header = $request->header('X-NCOM-Signature', '');

    parse_str(str_replace(',', '&', $header), $parts);

    $timestamp = (int) ($parts['t'] ?? 0);
    if (abs(time() - $timestamp) > 300) {
        return response('Stale', 400);
    }

    // Raw body, not the parsed array.
    $payload = $request->getContent();
    $expected = hash_hmac('sha256', $timestamp . '.' . $payload, $secret);

    if (! hash_equals($expected, $parts['v1'] ?? '')) {
        return response('Bad signature', 401);
    }

    $event = json_decode($payload, true);

    if (ProcessedWebhook::where('event_id', $event['id'])->exists()) {
        return response('OK', 200);
    }

    match ($event['topic']) {
        'inventory.updated' => Stock::syncFromNcom($event['data']),
        'product.updated'   => Product::upsertFromNcom($event['data']),
        'product.deleted'   => Product::removeFromNcom($event['data']),
        default             => null,
    };

    ProcessedWebhook::create(['event_id' => $event['id']]);

    return response('OK', 200);
}`}
              />

              <CodeBlock
                title="Python (Flask)"
                language="python"
                code={`import hmac, hashlib, time, json
from flask import Flask, request, abort

app = Flask(__name__)
SECRET = os.environ["NCOM_WEBHOOK_SECRET"].encode()

@app.post("/api/ncom-webhook")
def ncom_webhook():
    header = request.headers.get("X-NCOM-Signature", "")
    parts = dict(piece.strip().split("=", 1) for piece in header.split(","))

    timestamp = int(parts.get("t", 0))
    if abs(time.time() - timestamp) > 300:
        abort(400)

    # Raw bytes — request.get_json() would change them.
    payload = request.get_data()
    expected = hmac.new(
        SECRET, f"{timestamp}.".encode() + payload, hashlib.sha256
    ).hexdigest()

    if not hmac.compare_digest(expected, parts.get("v1", "")):
        abort(401)

    event = json.loads(payload)

    if already_processed(event["id"]):
        return "", 200

    if event["topic"] == "inventory.updated":
        set_local_stock(event["data"]["variant"]["sku"], event["data"]["available"])

    mark_processed(event["id"])
    return "", 200`}
              />

              <H3>Retries</H3>
              <P>
                Any response outside 2xx, and any request that takes longer than
                10 seconds, is retried up to six times with a widening gap:
                about 10 seconds, then 1 minute, 5 minutes, 30 minutes and 2
                hours. Redirects are not followed — a 301 counts as a failure,
                so point us at the final URL.
              </P>
              <P>
                An endpoint that fails 20 times in a row is paused automatically
                and shown as failing in the dashboard, where you can fix it and
                resume. Every attempt is listed there with its status code and
                error, and can be re-sent by hand.
              </P>
            </Section>

            <Section id="errors" title="Errors and limits">
              <Table
                head={['Code', 'HTTP', 'What it means']}
                rows={[
                  [
                    <code key="1" className="font-mono text-xs">
                      unauthorized
                    </code>,
                    '401',
                    'Missing, invalid, revoked or expired key',
                  ],
                  [
                    <code key="2" className="font-mono text-xs">
                      forbidden
                    </code>,
                    '403',
                    'The key lacks the permission this endpoint needs',
                  ],
                  [
                    <code key="3" className="font-mono text-xs">
                      not_found
                    </code>,
                    '404',
                    'No such record in this workspace',
                  ],
                  [
                    <code key="4" className="font-mono text-xs">
                      invalid_request
                    </code>,
                    '422',
                    'The body failed validation — see the fields array',
                  ],
                  [
                    <code key="5" className="font-mono text-xs">
                      rate_limited
                    </code>,
                    '429',
                    'Too many requests — honour the Retry-After header',
                  ],
                  [
                    <code key="6" className="font-mono text-xs">
                      server_error
                    </code>,
                    '500',
                    'Our fault. Retry with backoff.',
                  ],
                ]}
              />

              <CodeBlock
                title="A validation error"
                language="json"
                code={`{
  "error": {
    "code": "invalid_request",
    "message": "Some fields are not valid.",
    "fields": [
      { "path": "variants.0.priceCents", "message": "Price cannot be negative" }
    ]
  }
}`}
              />

              <P>
                Every response under <Code>/api/v1</Code> is JSON, including a
                mistyped path — that returns the same <Code>not_found</Code>
                envelope rather than an HTML page, so a typo surfaces as the 404
                it is instead of a JSON parse error that looks like the
                transport broke.
              </P>

              <CodeBlock
                title="A path that does not exist"
                language="json"
                code={`404 {
  "error": {
    "code": "not_found",
    "message": "No such endpoint: GET /api/v1/prodcuts. See the API reference at /docs."
  }
}`}
              />

              <H3>Rate limits</H3>
              <P>
                Per key, per minute: 600 reads and 120 writes, counted
                separately so a busy poller cannot starve its own writes. Image
                ingest has its own budget of 60 per minute on top of that, since
                each one is a download, a re-encode and an upload rather than a
                row write. A 429 carries <Code>Retry-After</Code> in seconds —
                wait that long rather than retrying immediately.
              </P>

              <div className="border-border/60 mt-10 rounded-xl border p-6">
                <p className="font-medium">Ready to connect something?</p>
                <p className="text-muted-foreground mt-1 text-sm">
                  Create a key in your dashboard under Developers → API keys,
                  then come back to the quickstart above.
                </p>
                <Link
                  href="/settings/api-keys"
                  className="mt-4 inline-flex text-sm font-medium underline"
                >
                  Go to API keys
                </Link>
              </div>
            </Section>
          </article>

          <nav
            aria-label="On this page"
            className="hidden lg:sticky lg:top-24 lg:block lg:h-fit"
          >
            <p className="eyebrow text-muted-foreground mb-3">On this page</p>
            <ul className="flex flex-col gap-2 text-sm">
              {NAV_SECTIONS.map((section) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {section.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </main>

      <Footer />
    </div>
  )
}

function Section({
  id,
  title,
  children,
}: {
  id: string
  title: string
  children: React.ReactNode
}) {
  return (
    <section
      id={id}
      className="scroll-mt-24 border-t py-10 first:border-t-0 first:pt-0"
    >
      <h2 className="font-display text-2xl font-semibold tracking-tight">
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  )
}

function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="mt-8 mb-2 text-lg font-semibold">{children}</h3>
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-muted-foreground my-3 leading-relaxed">{children}</p>
  )
}

function Ul({ children }: { children: React.ReactNode }) {
  return (
    <ul className="text-muted-foreground my-3 flex list-disc flex-col gap-2 pl-5 leading-relaxed">
      {children}
    </ul>
  )
}

function Ol({ children }: { children: React.ReactNode }) {
  return (
    <ol className="text-muted-foreground my-3 flex list-decimal flex-col gap-2 pl-5 leading-relaxed">
      {children}
    </ol>
  )
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-[0.85em]">
      {children}
    </code>
  )
}

function Callout({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <aside className="border-l-primary bg-muted/40 my-5 rounded-r-lg border-l-2 p-4">
      <p className="text-sm font-semibold">{title}</p>
      <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
        {children}
      </p>
    </aside>
  )
}

function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="my-4 overflow-x-auto rounded-xl border">
      <table className="w-full min-w-[32rem] text-left text-sm">
        <thead className="bg-muted/50">
          <tr>
            {head.map((cell) => (
              <th key={cell} className="px-4 py-2.5 font-medium">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  className={
                    cellIndex === 0
                      ? 'px-4 py-2.5 align-top whitespace-nowrap'
                      : 'text-muted-foreground px-4 py-2.5 align-top'
                  }
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const METHOD_TONE: Record<string, string> = {
  GET: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  POST: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
  PATCH: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  DELETE: 'bg-red-500/10 text-red-700 dark:text-red-400',
}

function EndpointTable({ rows }: { rows: [string, string, string][] }) {
  return (
    <div className="my-4 overflow-x-auto rounded-xl border">
      <table className="w-full min-w-[32rem] text-left text-sm">
        <tbody className="divide-y">
          {rows.map(([method, path, description]) => (
            <tr key={`${method} ${path}`}>
              <td className="px-4 py-2.5 align-top">
                <span
                  className={`rounded px-1.5 py-0.5 font-mono text-xs font-semibold ${METHOD_TONE[method]}`}
                >
                  {method}
                </span>
              </td>
              <td className="px-4 py-2.5 align-top font-mono text-xs whitespace-nowrap">
                {path}
              </td>
              <td className="text-muted-foreground px-4 py-2.5 align-top">
                {description}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
