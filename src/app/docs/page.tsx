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
  title: 'API & webhooks — NCOM developer documentation',
  description:
    'Import your existing catalogue, keep stock in sync in both directions, and receive signed webhooks when products, stock or orders change.',
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
 * The scope and topic tables are generated from the same constants the server
 * enforces, so a permission renamed in code cannot go on being documented under
 * its old name.
 */

const NAV_SECTIONS = [
  { id: 'quickstart', label: 'Quickstart' },
  { id: 'authentication', label: 'Authentication' },
  { id: 'conventions', label: 'Conventions' },
  { id: 'products', label: 'Products' },
  { id: 'images', label: 'Images' },
  { id: 'import', label: 'Importing a catalogue' },
  { id: 'categories', label: 'Categories' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'orders', label: 'Orders' },
  { id: 'courier', label: 'Courier automation' },
  { id: 'webhooks', label: 'Webhooks' },
  { id: 'stock-sync', label: 'Two-way stock sync' },
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
            API &amp; webhooks
          </h1>
          <p className="text-muted-foreground mt-4 text-lg">
            Move your catalogue in from the system you already use, and keep
            stock correct on both sides as orders come in. Every code sample on
            this page is copyable.
          </p>
        </header>

        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_14rem] lg:gap-12">
          <article className="prose-docs min-w-0">
            <Section id="quickstart" title="Quickstart">
              <P>
                Three steps: create a key, check it works, pull your products
                in. The whole thing takes about ten minutes.
              </P>

              <Ol>
                <li>
                  In your dashboard, go to{' '}
                  <strong>Developers → API keys</strong> and create a key with
                  the permissions you need. Copy it — it is shown once.
                </li>
                <li>
                  Confirm it is pointed at the right workspace with{' '}
                  <Code>GET /api/v1/me</Code>.
                </li>
                <li>
                  Push your catalogue with{' '}
                  <Code>POST /api/v1/products/import</Code> — images included,
                  by URL — then register a webhook so stock stays in step.
                </li>
              </Ol>

              <Callout title="Check currencyConfigured before your first import">
                Prices are minor units of the workspace currency and nothing
                downstream can detect a mismatch afterwards. If{' '}
                <Code>currencyConfigured</Code> is <Code>false</Code>, the
                workspace is still on a default nobody chose — set it under
                Settings first, and send <Code>expectCurrency</Code> on the
                import so a mismatch is refused rather than guessed.
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
      "name": "Main site sync",
      "scopes": ["PRODUCTS_READ", "PRODUCTS_WRITE", "INVENTORY_WRITE"]
    }
  }
}`}
              />
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

            <Section id="products" title="Products">
              <EndpointTable
                rows={[
                  ['GET', '/api/v1/products', 'List products'],
                  ['POST', '/api/v1/products', 'Create a product'],
                  ['GET', '/api/v1/products/{id}', 'Fetch one product'],
                  ['PATCH', '/api/v1/products/{id}', 'Update a product'],
                  ['DELETE', '/api/v1/products/{id}', 'Delete a product'],
                ]}
              />

              <P>
                List accepts <Code>?search=</Code> (title, handle, vendor, SKU
                or barcode), <Code>?status=active|draft|archived</Code> and{' '}
                <Code>?categoryId=</Code>. Filtering by a category includes
                everything beneath it, so asking for a department returns the
                products in its subcategories too.
              </P>

              <H3>Pulling only what changed</H3>
              <P>
                <Code>?updatedSince=</Code> and <Code>?createdSince=</Code> take
                an ISO 8601 timestamp and are what make an incremental sync
                possible — without them the only way to find recent changes is
                to page the whole catalogue and diff it locally, which burns
                your read budget on rows that did not move. Results are ordered
                newest-changed first.
              </P>

              <CodeBlock
                title="Everything touched in the last hour"
                language="bash"
                code={`SINCE=$(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%SZ)

curl "${baseUrl}/api/v1/products?updatedSince=$SINCE&limit=250" \\
  -H "Authorization: Bearer $NCOM_API_KEY"`}
              />

              <Callout title="Store the cursor from your own clock, not ours">
                Take the timestamp <em>before</em> you start a pull and use it
                as the next cursor, rather than the newest{' '}
                <Code>updatedAt</Code> you saw. A product changed while the pull
                was in flight would otherwise fall between the two and never be
                seen again. Overlap by a minute — events are idempotent, so
                re-reading a handful of rows is free.
              </Callout>

              <H3>Addressing a product by your own id</H3>
              <P>
                Anywhere <Code>{'{id}'}</Code> appears you can pass{' '}
                <Code>externalId:YOUR-ID</Code> instead of ours. That means you
                never have to store our ids or keep a mapping table.
              </P>

              <CodeBlock
                language="bash"
                code={`# Both fetch the same product
curl ${baseUrl}/api/v1/products/clx8f2k9v0000 \\
  -H "Authorization: Bearer $NCOM_API_KEY"

curl ${baseUrl}/api/v1/products/externalId:SKU-1042 \\
  -H "Authorization: Bearer $NCOM_API_KEY"`}
              />

              <H3>Creating a product</H3>
              <P>
                A product needs a title and at least one variant. A product
                without options still has exactly one variant — that is what
                carries the price and the stock.
              </P>

              <CodeBlock
                title="POST /api/v1/products"
                language="bash"
                code={`curl -X POST ${baseUrl}/api/v1/products \\
  -H "Authorization: Bearer $NCOM_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "Classic Cotton Tee",
    "description": "<p>Heavyweight combed cotton.</p>",
    "status": "ACTIVE",
    "vendor": "Elysium",
    "productType": "T-shirt",
    "tags": ["cotton", "summer"],
    "categoryId": "clx8category0001",
    "externalId": "SKU-1042",
    "options": [
      { "name": "Size", "position": 1, "values": ["S", "M", "L"] }
    ],
    "variants": [
      { "option1": "S", "priceCents": 1299, "sku": "TEE-S", "weightGrams": 180 },
      { "option1": "M", "priceCents": 1299, "sku": "TEE-M", "weightGrams": 190 },
      { "option1": "L", "priceCents": 1499, "sku": "TEE-L", "weightGrams": 200 }
    ]
  }'`}
              />

              <Callout title="Variants and options have to agree">
                If you declare an option with three values, send three variants
                — one per combination. Two variants sharing the same combination
                are rejected, because the storefront would have no way to decide
                which one a shopper picked.
              </Callout>

              <H3>Updating</H3>
              <P>
                <Code>PATCH</Code> is a partial update: fields you omit are left
                alone. Two exceptions are worth knowing —{' '}
                <Code>{'"categoryId": null'}</Code> removes a product from its
                category, and sending <Code>variants</Code> replaces the whole
                set, so include every variant you want to keep.
              </P>

              <CodeBlock
                language="bash"
                code={`curl -X PATCH ${baseUrl}/api/v1/products/externalId:SKU-1042 \\
  -H "Authorization: Bearer $NCOM_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "status": "DRAFT" }'`}
              />

              <H3>Deleting</H3>
              <P>
                A product that appears on an order cannot be deleted — the
                request is refused with <Code>invalid_request</Code>. Archive it
                instead (<Code>{'{ "status": "ARCHIVED" }'}</Code>): it leaves
                the storefront, and past orders stay readable.
              </P>
            </Section>

            <Section id="images" title="Images">
              <P>
                Send <Code>images[].src</Code> and we fetch the file, re-encode
                it to WebP and store it. You do not have to upload anything
                first — a catalogue whose photographs live on your existing CDN
                can be moved across in one call per product.
              </P>

              <CodeBlock
                title="Images by URL, on create or update"
                language="bash"
                code={`curl -X POST ${baseUrl}/api/v1/products \\
  -H "Authorization: Bearer $NCOM_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "Classic Cotton Tee",
    "variants": [{ "priceCents": 1299 }],
    "images": [
      { "src": "https://cdn.yourshop.com/tee-front.jpg", "altText": "Front", "position": 0 },
      { "src": "https://cdn.yourshop.com/tee-back.jpg",  "altText": "Back",  "position": 1 }
    ]
  }'`}
              />

              <P>
                Fetches are deduplicated on the URL. Re-running an import does
                not download the same photographs again, and the product keeps
                pointing at the asset that is already there — so an import you
                run nightly costs one request per image the first time and none
                afterwards.
              </P>

              <H3>The media library directly</H3>
              <EndpointTable
                rows={[
                  ['GET', '/api/v1/media', 'List assets'],
                  [
                    'POST',
                    '/api/v1/media',
                    'Add one, from a URL or an uploaded file',
                  ],
                ]}
              />

              <P>
                Use this when you want the <Code>mediaId</Code> before creating
                the product, or when the bytes are local rather than on a public
                URL. Assets are workspace-wide, so one uploaded image can be
                used by several products.
              </P>

              <CodeBlock
                title="From a URL"
                language="bash"
                code={`curl -X POST ${baseUrl}/api/v1/media \\
  -H "Authorization: Bearer $NCOM_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "src": "https://cdn.yourshop.com/tee-front.jpg", "altText": "Front" }'

# 201 {"data":{"id":"clx8media0001","url":"https://cdn.ncom…/x.webp",
#              "width":1600,"height":2000,"sourceUrl":"https://cdn.yourshop.com/tee-front.jpg"}}
#
# 200 instead of 201 means this URL was already in the library and
# the existing asset was returned.`}
              />

              <CodeBlock
                title="From a local file"
                language="bash"
                code={`curl -X POST ${baseUrl}/api/v1/media \\
  -H "Authorization: Bearer $NCOM_API_KEY" \\
  -F "file=@tee-front.jpg" \\
  -F "altText=Front"`}
              />

              <P>
                Then reference it by id, which behaves exactly like a{' '}
                <Code>src</Code> did:
              </P>

              <CodeBlock
                language="json"
                code={`{ "images": [{ "mediaId": "clx8media0001", "position": 0 }] }`}
              />

              <H3>Rules and limits</H3>
              <Ul>
                <li>
                  PNG, JPEG, WebP and GIF. Everything is re-encoded to WebP and
                  scaled to fit 2400×2400, so upload the largest version you
                  have.
                </li>
                <li>
                  10&nbsp;MB per image. A URL that returns something bigger is
                  refused without being downloaded in full.
                </li>
                <li>
                  URLs must be public http or https. Private, loopback and
                  link-local addresses are refused — this server does the
                  fetching, so it will not be pointed at an internal one.
                </li>
                <li>
                  <Code>position</Code> 0 is the product&rsquo;s main image: the
                  one on cards, order lines and offer thumbnails.
                </li>
                <li>
                  Image ingest has its own budget of 60 per minute, separate
                  from the general write limit, because each one is a download,
                  a re-encode and an upload.
                </li>
              </Ul>

              <Callout title="Sending images replaces the gallery">
                Like <Code>variants</Code>, an <Code>images</Code> array on{' '}
                <Code>PATCH</Code> is the complete new gallery — anything you
                leave out is removed from the product. Omit the key entirely to
                leave the existing images alone. The underlying assets stay in
                the library either way.
              </Callout>
            </Section>

            <Section id="import" title="Importing your existing catalogue">
              <P>
                This is the endpoint to use when moving in from another system.
                It takes up to 100 products per request and matches on{' '}
                <Code>externalId</Code> — the id each product already has in
                your database — so running it twice updates rather than
                duplicates.
              </P>

              <EndpointTable
                rows={[
                  [
                    'POST',
                    '/api/v1/products/import',
                    'Create or update up to 100 products',
                  ],
                ]}
              />

              <CodeBlock
                title="POST /api/v1/products/import"
                language="json"
                code={`{
  "source": "my-old-shop",
  "expectCurrency": "BDT",
  "products": [
    {
      "externalId": "42",
      "title": "Silk Maxi Dress",
      "status": "ACTIVE",
      "categoryId": "clx8category0002",
      "images": [{ "src": "https://cdn.yourshop.com/42.jpg" }],
      "options": [{ "name": "Size", "position": 1, "values": ["S", "M"] }],
      "variants": [
        { "option1": "S", "priceCents": 4999, "sku": "DRS-42-S" },
        { "option1": "M", "priceCents": 4999, "sku": "DRS-42-M" }
      ]
    }
  ]
}`}
              />

              <H3>Always send expectCurrency</H3>
              <P>
                <Code>priceCents</Code> is minor units{' '}
                <em>of the workspace currency</em>. If the workspace prices in
                USD and you send taka, ৳1,290 becomes $1,290.00 — the import
                reports complete success, and nothing in the resulting numbers
                can tell you afterwards that it happened.
              </P>
              <P>
                <Code>expectCurrency</Code> is the guard. If it does not match
                the workspace, the batch is refused with <Code>conflict</Code>{' '}
                before a single row is written.
              </P>

              <CodeBlock
                title="A mismatch, refused"
                language="json"
                code={`409 {
  "error": {
    "code": "conflict",
    "message": "This workspace prices in USD, but the import declared BDT. Nothing was imported.",
    "workspaceCurrency": "USD",
    "declaredCurrency": "BDT"
  }
}`}
              />

              <P>
                Every import response echoes <Code>currencyCode</Code> whether
                you asserted or not, and a workspace still sitting on the
                default currency nobody has ever chosen comes back with a{' '}
                <Code>warnings</Code> entry. <Code>GET /api/v1/me</Code> reports
                the same thing as <Code>currencyConfigured</Code>, which is
                worth checking once at the top of a migration script.
              </P>

              <P>
                The response reports each row separately. One bad product does
                not fail the batch — fix the rows in <Code>errors</Code> and
                re-send just those.
              </P>

              <CodeBlock
                title="Response"
                language="json"
                code={`{
  "data": {
    "created": 98,
    "updated": 1,
    "failed": 1,
    "createdIds": ["clx8…", "clx9…"],
    "updatedIds": ["clxa…"],
    "errors": [
      { "externalId": "77", "error": "A product needs at least one variant" }
    ]
  }
}`}
              />

              <H3>A complete migration script</H3>
              <P>
                Read your products in pages, map them to our shape, and send
                them in batches. This is the whole job.
              </P>

              <CodeBlock
                title="migrate.mjs"
                language="javascript"
                code={`const API = '${baseUrl}/api/v1'
const KEY = process.env.NCOM_API_KEY
const BATCH = 100

async function post(path, body) {
  const response = await fetch(API + path, {
    method: 'POST',
    headers: {
      Authorization: \`Bearer \${KEY}\`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const problem = await response.json().catch(() => ({}))
    throw new Error(problem.error?.message ?? \`HTTP \${response.status}\`)
  }
  return response.json()
}

async function get(path) {
  const response = await fetch(API + path, {
    headers: { Authorization: \`Bearer \${KEY}\` },
  })
  if (!response.ok) throw new Error(\`HTTP \${response.status} on \${path}\`)
  return response.json()
}

// Map one row from YOUR database into our product shape.
function toProduct(row) {
  return {
    externalId: String(row.id),
    title: row.name,
    description: row.description ?? '',
    status: row.isPublished ? 'ACTIVE' : 'DRAFT',
    vendor: row.brand ?? undefined,
    tags: row.tags ?? [],
    // Images travel by URL — we fetch and store them, deduplicated on the
    // URL so a re-run costs nothing.
    images: (row.images ?? []).map((url, index) => ({
      src: url,
      position: index,
    })),
    // Prices in minor units: 12.99 becomes 1299.
    options: row.variants.length > 1
      ? [{
          name: 'Size',
          position: 1,
          values: [...new Set(row.variants.map((v) => v.size))],
        }]
      : [],
    variants: row.variants.map((variant) => ({
      option1: row.variants.length > 1 ? variant.size : null,
      sku: variant.sku,
      priceCents: Math.round(variant.price * 100),
      inventoryTracked: true,
    })),
  }
}

// Fail before writing anything if the workspace is not set up as expected.
const me = await get('/me')
if (!me.data.organization.currencyConfigured) {
  throw new Error(
    'Workspace currency was never explicitly set — choose it under Settings first'
  )
}

const CURRENCY = me.data.organization.currencyCode
console.log('importing as', CURRENCY)

const all = await loadProductsFromYourDatabase() // your code

for (let i = 0; i < all.length; i += BATCH) {
  const chunk = all.slice(i, i + BATCH).map(toProduct)
  const { data } = await post('/products/import', {
    source: 'my-old-shop',
    // Refused outright if the workspace prices in anything else.
    expectCurrency: CURRENCY,
    products: chunk,
  })

  console.log(\`\${i + chunk.length}/\${all.length}\`,
    \`created \${data.created}, updated \${data.updated}, failed \${data.failed}\`)

  for (const warning of data.warnings ?? []) console.warn('  ', warning)

  for (const problem of data.errors) {
    console.error('  failed', problem.externalId, '—', problem.error)
  }
}`}
              />

              <Callout title="Import stock separately">
                The import sets up products, options and prices. Stock is not
                part of it, because stock changes on its own schedule and a
                re-run of the import should not silently reset counts a sale has
                since moved. Push counts with the inventory endpoint below.
              </Callout>
            </Section>

            <Section id="categories" title="Categories">
              <P>
                Categories go three levels deep — category, subcategory, child
                category. A product is filed in exactly one of them, normally
                the most specific one that applies.
              </P>

              <EndpointTable
                rows={[
                  ['GET', '/api/v1/categories', 'The tree, nested'],
                  ['POST', '/api/v1/categories', 'Create a category'],
                  ['GET', '/api/v1/categories/{id}', 'Fetch one'],
                  ['PATCH', '/api/v1/categories/{id}', 'Rename, move, reorder'],
                  ['DELETE', '/api/v1/categories/{id}', 'Delete'],
                ]}
              />

              <P>
                Add <Code>?flat=true</Code> to get rows instead of a tree.
                Deleting defaults to lifting the children up a level; pass{' '}
                <Code>?mode=cascade</Code> to remove the whole branch. Either
                way, products are only unfiled — never deleted.
              </P>

              <CodeBlock
                title="Build a three-level tree"
                language="bash"
                code={`# 1. Top level
WOMEN=$(curl -s -X POST ${baseUrl}/api/v1/categories \\
  -H "Authorization: Bearer $NCOM_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "name": "Womenswear", "code": "WMN" }' | jq -r '.data.id')

# 2. Subcategory
DRESSES=$(curl -s -X POST ${baseUrl}/api/v1/categories \\
  -H "Authorization: Bearer $NCOM_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d "{ \\"name\\": \\"Dresses\\", \\"parentId\\": \\"$WOMEN\\", \\"code\\": \\"DRS\\" }" | jq -r '.data.id')

# 3. Child category
curl -X POST ${baseUrl}/api/v1/categories \\
  -H "Authorization: Bearer $NCOM_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d "{ \\"name\\": \\"Maxi\\", \\"parentId\\": \\"$DRESSES\\" }"`}
              />

              <Callout title="Three levels is the limit">
                Creating a child under a third-level category is refused. The
                cap is deliberate: storefront navigation, breadcrumbs and
                filters all render the whole tree, and an unbounded one is
                unusable long before it is slow.
              </Callout>
            </Section>

            <Section id="inventory" title="Inventory">
              <EndpointTable
                rows={[
                  ['GET', '/api/v1/inventory', 'Stock per variant'],
                  ['POST', '/api/v1/inventory', 'Set or adjust stock'],
                ]}
              />

              <P>
                Reads accept <Code>?search=</Code>,{' '}
                <Code>?stock=low|out|in</Code> and <Code>?locationId=</Code>.
                Every row reports <Code>available</Code> (what can still be
                sold) and <Code>committed</Code> (reserved by orders that are
                placed but not yet shipped).
              </P>

              <CodeBlock
                title="GET /api/v1/inventory?stock=low"
                language="json"
                code={`{
  "data": [
    {
      "variantId": "clx8variant0001",
      "productId": "clx8product0001",
      "productTitle": "Classic Cotton Tee",
      "variantTitle": "M",
      "sku": "TEE-M",
      "available": 3,
      "committed": 2,
      "inventoryPolicy": "deny",
      "locations": [
        { "id": "clx8loc0001", "name": "Main warehouse", "available": 3, "committed": 2 }
      ]
    }
  ],
  "pagination": { "page": 1, "limit": 50, "total": 1, "hasMore": false }
}`}
              />

              <H3>Writing stock back</H3>
              <P>
                Each update gives either <Code>available</Code> or{' '}
                <Code>delta</Code>, never both. The difference matters:
              </P>

              <Ul>
                <li>
                  <Code>available</Code> is an absolute count — &ldquo;there are
                  42&rdquo;. Use it when your system is the authority on stock.
                </li>
                <li>
                  <Code>delta</Code> is a signed change — &ldquo;12
                  arrived&rdquo;, &ldquo;2 damaged&rdquo;. Use it when more than
                  one system moves the same stock, because two concurrent
                  absolute writes discard one of them while two deltas both
                  apply.
                </li>
              </Ul>

              <P>
                Address variants by <Code>variantId</Code> or by{' '}
                <Code>sku</Code>. Up to 250 updates per request.
              </P>

              <CodeBlock
                title="POST /api/v1/inventory"
                language="bash"
                code={`curl -X POST ${baseUrl}/api/v1/inventory \\
  -H "Authorization: Bearer $NCOM_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "updates": [
      { "sku": "TEE-S", "available": 42 },
      { "sku": "TEE-M", "delta": -1, "reason": "DAMAGED", "note": "Torn in transit" },
      { "sku": "TEE-L", "delta": 24, "reason": "RECEIVED" }
    ]
  }'`}
              />

              <P>
                Every write lands in the stock ledger with its reason and note,
                so the merchant can see in their dashboard exactly what your
                integration did and when.
              </P>

              <H3>Read the response — a 200 does not mean every row applied</H3>
              <Callout title="This is the most important paragraph on the page">
                The endpoint applies what it can and reports the rest. A caller
                that treats <Code>200</Code> as success will silently lose every
                rejected row and drift out of step without ever seeing an error.
                Check <Code>failed</Code> and <Code>clamped</Code> on every
                call.
              </Callout>

              <CodeBlock
                title="Response — always 200, always this shape"
                language="json"
                code={`{
  "data": {
    "applied": 2,        // rows whose stock moved
    "failed": 1,         // rows that could not be applied at all
    "clamped": 1,        // rows applied, but by less than you asked for

    "results": [
      { "variantId": "clx8variant0001", "sku": "TEE-S", "available": 42 },
      { "variantId": "clx8variant0002", "sku": "TEE-M", "available": 0 }
    ],

    "errors": [
      { "sku": "NO-SUCH-SKU", "error": "No variant with that SKU" }
    ],

    "clamps": [
      { "variantId": "clx8variant0002", "sku": "TEE-M",
        "requested": -100, "applied": -2, "available": 0 }
    ]
  }
}`}
              />

              <P>
                The status code is <Code>200</Code> whatever the mix — including
                when nothing applied at all, in which case <Code>applied</Code>{' '}
                is <Code>0</Code> and every row is in <Code>errors</Code>. The
                batch was accepted and processed; the per-row outcome is always
                in the same place, so you need one code path rather than two.
              </P>

              <H3>Clamping</H3>
              <P>
                A delta that would push stock below zero is clamped rather than
                creating a negative count — negative availability has one
                legitimate meaning here, a backorder backlog on a variant set to
                keep selling at zero, and a typo should not be able to
                manufacture one.
              </P>
              <P>
                A clamped row still counts as <Code>applied</Code>, because
                stock did move. It also appears in <Code>clamps</Code> with what
                you asked for and what actually happened. That entry is the
                signal that your side believes it removed stock that was never
                there — which is exactly when two systems begin to disagree, so
                it is worth alerting on rather than logging.
              </P>

              <CodeBlock
                title="Asking to remove 100 from a shelf holding 2"
                language="json"
                code={`{ "updates": [{ "sku": "TEE-M", "delta": -100, "reason": "DAMAGED" }] }

200 {
  "data": {
    "applied": 1, "failed": 0, "clamped": 1,
    "results": [{ "variantId": "clx8variant0002", "sku": "TEE-M", "available": 0 }],
    "errors": [],
    "clamps": [{ "variantId": "clx8variant0002", "sku": "TEE-M",
                 "requested": -100, "applied": -2, "available": 0 }]
  }
}`}
              />

              <Callout title="Variants that do not track stock are reported, not silently skipped">
                Setting a count on a variant with inventory tracking switched
                off lands in <Code>errors</Code> rather than{' '}
                <Code>applied</Code>. Such a variant is infinitely available and
                has no count to hold, and a sync that believes it wrote 40 units
                there is wrong in a way it needs to see.
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

            <Section id="stock-sync" title="Two-way stock sync">
              <P>
                The pattern most people want: your existing shop and this one
                sell the same physical stock, and neither should sell a unit the
                other already sold.
              </P>

              <Ol>
                <li>
                  <strong>Us → you.</strong> Subscribe to{' '}
                  <Code>inventory.updated</Code> and <Code>order.created</Code>.
                  When an order is placed here, the stock is reserved before the
                  webhook fires, so the <Code>available</Code> figure you
                  receive is already correct to write straight into your system.
                </li>
                <li>
                  <strong>You → us.</strong> When an order is placed on your
                  side, POST the change to <Code>/api/v1/inventory</Code> using{' '}
                  <Code>delta</Code>. Use <Code>delta</Code> rather than{' '}
                  <Code>available</Code> here: both systems are moving the same
                  numbers concurrently, and deltas compose where absolute writes
                  overwrite.
                </li>
                <li>
                  <strong>Reconcile nightly.</strong> Once a day, when nothing
                  is selling, push absolute <Code>available</Code> counts from
                  whichever system does the physical counting. Deltas drift over
                  months; a periodic absolute write is what pulls them back.
                </li>
              </Ol>

              <CodeBlock
                title="Your side: an order was placed, tell us"
                language="javascript"
                code={`// Called from your own checkout, after the sale is committed.
async function reportSale(lines) {
  await fetch('${baseUrl}/api/v1/inventory', {
    method: 'POST',
    headers: {
      Authorization: \`Bearer \${process.env.NCOM_API_KEY}\`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      updates: lines.map((line) => ({
        sku: line.sku,
        delta: -line.quantity,
        reason: 'MANUAL',
        note: \`Sold on main site — order \${line.orderNumber}\`,
      })),
    }),
  })
}`}
              />

              <Callout title="Guard against loops">
                A stock write from you produces an{' '}
                <Code>inventory.updated</Code> webhook back to you. Ignore
                events whose numbers already match what you hold, or briefly
                mark SKUs you have just pushed — otherwise the two systems will
                talk to each other forever.
              </Callout>
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
