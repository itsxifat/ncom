# Product source: reading a merchant's catalogue live

A workspace sells from two catalogues, and this document is about one of them.

**Your website.** Connected here, read live, never copied. There is no product
table, no variant table and no copy of your photographs on this platform for
these goods. When a shopper opens a landing page, NCOM asks your site what you
sell, what it costs and how many are left, and renders the answer. When that
shopper places an order, NCOM asks again, and records what it was told.

**Products stored in NCOM.** Added under **Products → Add product** or through
`/api/v1/products`, kept in this platform's own database, edited here. That is
for the things your shop does not carry — a bundle-only item, a campaign gift, a
sample, something you are testing before it goes live on your real site.

Use either. Use both; most workspaces do, and a single offer can mix them —
three of your own shirts plus a tote that only exists for this campaign.

This document is the contract for the first kind: what NCOM calls on your site,
what it sends, what it expects back, and what you have to deploy for any of it to
work. If you only want the second kind, you can stop reading — nothing here is
required to sell products you keep in NCOM.

---

## 1. Why the live half exists

The obvious design is the one this replaced: push your catalogue into NCOM
through `POST /api/v1/products`, keep it in step with a nightly sync, and post
stock corrections to `POST /api/v1/inventory`. Those endpoints still exist — they
are how you manage products NCOM _stores_ — but they are no longer how you sell
what is already on your own shop.

Every problem the sync-everything design had came from the same root: two copies
of one fact.

- A price raised at 3pm on the merchant's shop was still the old price on their
  landing page until a sync ran. The page was not wrong about _a_ price — it was
  quoting one nobody was charging.
- Stock drifted. Our count and theirs disagreed by exactly as much as had been
  sold through the channel the other one could not see, and the argument about
  which was right had no answer, because neither was.
- Every merchant wrote an importer. That is a paginated, idempotent,
  retry-handling piece of software that has to run forever, and it was the first
  thing they had to build and the first thing that broke.

Reading live removes the copy _for goods that already exist somewhere else_.
There is exactly one price, it lives where you edit it, and a landing page shows
it because it asked a moment ago.

A product you add in NCOM has no second copy either — there is only the one, and
it is here. The rule is the same in both directions: one fact, one home.

**What it costs.** For your products, your website is on the critical path of
every storefront render. If your server is down, those product blocks do not
render; if it is slow, the page is slow. There is no cache to hide behind —
deliberately, see §7. Connecting a site is choosing that trade, and the dashboard
says so plainly rather than hiding it. Products stored in NCOM are unaffected: no
network call is involved in showing one.

---

## 2. What a merchant has to build

One HTTP endpoint group on their own domain, answering JSON. That is all.

| Endpoint                           | Required    | What it answers                        |
| ---------------------------------- | ----------- | -------------------------------------- |
| `GET {base}/ping`                  | ✅          | "I am alive, here is what I implement" |
| `GET {base}/products`              | ✅          | a page of products                     |
| `GET {base}/products/{idOrHandle}` | ✅          | one product                            |
| `POST {base}/stock`                | recommended | current stock for a list of variants   |
| `POST {base}/variants`             | optional    | variants by id, without their products |
| `GET {base}/categories`            | optional    | the browse tree                        |
| `POST {base}/reserve`              | optional    | hold units for an order                |
| `POST {base}/release`              | optional    | give held units back                   |

`{base}` is whatever the merchant enters in **Settings → Product source**, for
example `https://shop.example.com/ncom/v1`. Every path above hangs off it.

Working implementations to copy are in [`connectors/`](../connectors):

- `connectors/php/ncom-connector.php` — plain PHP + PDO, any MySQL shop
- `connectors/woocommerce/ncom-connector.php` — a WordPress plugin, zero SQL
- `connectors/node/ncom-connector.js` — Express, any Node stack

The shortest honest implementation is about 120 lines. It is smaller than the
importer it replaces, and unlike the importer it does not have to run on a
schedule, retry, or hold state.

---

## 3. Authentication

Every request NCOM makes carries four headers:

```
X-NCOM-Key:       ncomcat_9f2b1c4d7e08
X-NCOM-Contract:  1
X-NCOM-Timestamp: 1772630400
X-NCOM-Signature: t=1772630400,v1=6f1d…c3
User-Agent:       NCOM-Catalog/1
```

The signature is:

```
v1 = hex( hmac_sha256( secret, "<timestamp>" + "." + "<raw request body>" ) )
```

The body is the **exact bytes** of the request body, and the empty string for
every `GET`. The key id and secret are generated by NCOM when the connection is
created and shown once; rotate them from the same screen.

A connector must:

1. reject anything whose `X-NCOM-Key` is not the key it was configured with;
2. recompute the HMAC over `timestamp + "." + body` and compare it in
   **constant time** to `v1`;
3. reject a timestamp more than **5 minutes** from its own clock;
4. answer `401` when any of those fail.

> This is byte-for-byte the scheme NCOM uses to sign outgoing webhooks. A
> merchant who already verifies our webhooks can paste the same function here.

The signature deliberately does not cover the path. Path canonicalisation across
Apache, nginx, WordPress rewrites and CDN normalisation is where signature
schemes go to die, and a read key may read every read endpoint anyway. What it
does prove is that the caller holds the secret and that the request is fresh.

**A connector must not be usable without a valid signature.** It exposes cost
prices, draft products and stock levels, and on sites that implement `/reserve`
it can move stock.

---

## 4. The endpoints

### `GET {base}/ping`

The handshake. NCOM calls it when a merchant presses **Test**, never during a
shopper's page render.

```json
{
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
}
```

`capabilities` is what NCOM believes about the site until the next handshake. Be
honest in it: claiming `reserve` and not implementing it turns a clear "your site
cannot hold stock" warning in the dashboard into an unexplained checkout failure.

`currency` is compared against the workspace's own. A mismatch is reported rather
than converted — nothing in this system converts currencies, and reading a price
as USD while charging it as BDT is a hundredfold error.

### `GET {base}/products`

A page of products. Query parameters, all optional:

| Parameter  | Meaning                                                       |
| ---------- | ------------------------------------------------------------- |
| `limit`    | how many to return (1–100)                                    |
| `cursor`   | opaque; whatever you returned as `nextCursor` last time       |
| `q`        | free-text search, if you declared `search`                    |
| `category` | a category id, if you declared `categories`                   |
| `ids`      | comma-separated product ids — **honour this one** (see below) |
| `status`   | `active` (default) or `any`                                   |

```json
{
  "products": [/* see §5 */],
  "nextCursor": "eyJpZCI6MTI4fQ",
  "total": 412
}
```

`nextCursor` is opaque to NCOM — an offset, a row id, a base64 blob, anything —
and `null` when there are no more. `total` is optional; return it only if you can
count cheaply.

**`ids` matters more than it looks.** It is how NCOM rehydrates a saved
reference: an offer built last week names four product ids, and every render of
that landing page asks for exactly those four. A connector that ignores `ids` and
returns its first page instead makes the offer appear to sell the wrong things.
NCOM defends against this by re-fetching anything missing one-by-one, but that
turns one request into five.

### `GET {base}/products/{idOrHandle}`

One product, by its id **or** by its URL handle — NCOM uses both. Return the same
object shape as a list entry, either bare or wrapped in `{"product": …}`.

Return `404` when it does not exist. That is an answer, not an error: NCOM shows
the offer as unavailable rather than breaking the page.

### `POST {base}/stock`

The hot one. Called on every cart render and again inside every checkout.

```json
→ { "ids": ["4201", "4202", "4203"] }

← { "stock": [
      { "id": "4201", "available": 12, "policy": "deny" },
      { "id": "4202", "available": 0,  "policy": "continue" },
      { "id": "4203", "available": null }
   ] }
```

Keep it fast. It is the one endpoint a shopper waits on twice.

Not implementing it is allowed — NCOM falls back to reading whole products —
but it will read a lot more of your database than it needs to.

### `POST {base}/variants` _(optional)_

`{"ids": [...]}` → `{"variants": [...]}`, each variant carrying `productId`.

Only used for a reference saved without its product id, which since this release
means data written by an older version. Skip it unless you are migrating.

### `GET {base}/categories` _(optional)_

```json
{
  "categories": [
    {
      "id": "12",
      "name": "Shirts",
      "handle": "shirts",
      "parentId": null,
      "count": 42
    },
    {
      "id": "18",
      "name": "Half sleeve",
      "handle": "half-sleeve",
      "parentId": "12"
    }
  ]
}
```

Nest as deep as you like. Used for dashboard filters and for scoping discounts.

### `POST {base}/reserve` and `POST {base}/release` _(optional, strongly recommended)_

```json
→ { "orderRef": "clz3k…", "lines": [ { "variantId": "4201", "quantity": 2 } ] }

← { "ok": true }
← { "ok": false, "rejected": [ { "variantId": "4201", "reason": "Only 1 left" } ] }
```

`reserve` means "take these units out of what is sellable, for this order".
`release` means "put them back". `orderRef` is stable per checkout and is repeated
on the release, so an implementation can be idempotent on it.

**This is the single most consequential choice a merchant makes about their
connector.**

- With `/reserve`: the units are taken on your side before NCOM writes the
  order, and handed back if writing it fails. Two shoppers cannot buy the same
  last unit, because your database decided which of them got it.
- Without it: NCOM checks stock moments before writing the order and no more.
  Two shoppers reaching the last unit in the same second both get an order, and
  the merchant sorts it out — exactly as they did before they had NCOM.

Either is a legitimate way to run a shop. The dashboard shows which mode a
workspace is in, and this document exists so nobody discovers it during a sale.

A `reserve` implementation should decrement the same number the storefront sells
from, inside a transaction, conditionally — the SQL shape is
`UPDATE … SET stock = stock - :n WHERE id = :id AND stock >= :n` and a row count
of zero is the refusal.

---

## 5. The product shape

```json
{
  "id": "42",
  "handle": "classic-tee",
  "title": "Classic Tee",
  "status": "active",
  "description": "Soft cotton, boxy fit.",
  "vendor": "Acme",
  "productType": "Shirts",
  "tags": ["summer"],
  "categoryId": "12",
  "url": "https://shop.example.com/product/classic-tee",
  "images": [
    { "url": "https://shop.example.com/img/tee.jpg", "alt": "Classic tee" }
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
      "weightGrams": 220,
      "imageUrl": "https://shop.example.com/img/tee-m.jpg"
    }
  ]
}
```

### Field rules that matter

**Ids are yours.** Whatever your system already calls a product — a WooCommerce
post id, a UUID, a SKU — is what NCOM stores in offers, carts and order lines.
Up to 200 characters, and numbers are fine (`42` and `"42"` are the same id).

The only real requirement is that they are **stable**. An id that changes is a
saved offer that stops resolving.

**Prices** may be `price` as a decimal string or number (`"1250.00"`, `1250`), or
`priceCents` as an integer in minor units (`125000`). Decimals are interpreted in
the workspace's currency. Send the price a customer pays — including tax if your
prices are tax-inclusive.

**Never send cost prices.** There is no field for them and nothing here needs
them.

**Stock**, in the order NCOM reads it:

1. `available` / `stock` / `stockQuantity` / `quantity` — a number. Used as-is.
2. `tracked: false` or `manageStock: false` — not counted, always sellable.
3. `inStock: true` / `false` — `false` is a hard zero; `true` means "sell it"
   with no particular count.
4. Nothing at all — treated as **not counted**, i.e. sellable.

That last rule is deliberate: a site that does not report stock is saying it does
not count stock, and reading silence as "sold out" would take an entire catalogue
off sale over a missing field.

`policy` is `deny` (stop at zero, the default) or `continue` (allow backorders).
WooCommerce's `backorders` values are understood.

**Status** is `active`, `draft` or `archived`. WordPress's `publish`, `pending`,
`private` and `trash` are understood. **Only `active` products are sellable**;
draft ones appear in the dashboard so a merchant can build a page before
publishing, and are refused at checkout.

**Images** are absolute URLs on the merchant's own site or CDN. NCOM never
downloads, re-hosts or resizes them — the `<img>` on the landing page points at
the merchant's server. Send `{"url":…,"alt":…}` objects or bare URL strings; both
work. Serve them over HTTPS, or browsers will block them on a landing page.

**Simple products need no variants at all.** Put `price`, `sku` and `available`
on the product itself, omit `variants`, and NCOM synthesises a single variant
whose id is the product's own id. Shops that sell one SKU per product never have
to invent a variant model.

**Casing.** `snake_case` and `camelCase` are both accepted everywhere:
`stock_quantity` and `stockQuantity` are the same field. Write whichever your
platform already produces.

---

## 6. What NCOM does with a bad answer

Only the products read from your site are affected. A page selling something NCOM
stores keeps working through every row of this table.

| Situation                               | What happens                                                                                                                                                                                                               |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Connector unreachable / times out       | The landing page still renders; offers holding one of your products are hidden, and an order form left with nothing to sell says "unavailable for a moment". Checkout refuses those lines. The reason is in the dashboard. |
| `401` from your connector               | Same, and the dashboard says the key or the clock is wrong.                                                                                                                                                                |
| HTML instead of JSON                    | Treated as a misconfigured base URL and says so — this is the most common first-time failure.                                                                                                                              |
| A product in an offer is missing        | That offer is hidden from the page. The Offers screen names the product id.                                                                                                                                                |
| A product is `draft`                    | Same as missing: hidden from shoppers, visible in the dashboard.                                                                                                                                                           |
| Every variant is out of stock           | The offer still shows, marked sold out. Checkout refuses it.                                                                                                                                                               |
| Stock ran out between page and checkout | The order is refused with "sold out while you were checking out".                                                                                                                                                          |
| A response over 8MB                     | Refused. Page your products with `nextCursor`.                                                                                                                                                                             |

Nothing here fails silently in a way that sells something at the wrong price. The
rule NCOM applies throughout: when the catalogue cannot be read, refuse to sell,
never guess.

---

## 7. Performance, and why there is no cache

There is no cache of your catalogue. Not in Redis, not in the page, not for five
seconds. Every read is `cache: 'no-store'` and every value dies with the request
that fetched it.

That is the design. The entire reason this platform stopped storing a catalogue
was that a stored catalogue goes stale, and a five-second cache is a stored
catalogue with a short attention span. A price on a storefront is what the
merchant's shop is charging _now_.

What NCOM does instead, to keep the load sane:

- **One request per distinct question per render.** Reads are deduplicated
  within a single request, so a page with six offers over four products makes one
  products call, not six.
- **Batched by id.** Up to 50 ids per call.
- **Bounded.** A page's offers may reference at most 200 products; the stock
  screen reads at most 1,000 products and says so when it stops.
- **Timed out.** Default 4 seconds, configurable 1–10. A shopper is waiting.

What a merchant should do on their side:

- Serve `/products` and `/stock` from an index, not a full scan.
- Cache on _their_ side if they want to — they know when their own data changes
  and can invalidate correctly, which is exactly what NCOM cannot do from here.
- Allow our egress IP through any rate limiter. A `429` shows as gaps in the
  storefront.
- Keep `/stock` under ~200ms. It is called twice per sale.

---

## 8. Going live: the checklist

1. Deploy the connector at a public HTTPS URL. `http://` is refused in
   production.
2. In NCOM: **Settings → Product source** → paste the base URL → **Connect**.
3. Copy the key id and secret into your connector's config. They are shown once.
4. Press **Test**. The panel reports the platform, the currency and every
   capability it found.
5. Check **Products**. Your catalogue should be there, read live.
6. Check the currency line has no warning on it.
7. Build an offer, open the landing page, and confirm the price on the page is
   the price on your shop.
8. Change a price on your shop and reload the landing page. It should change.
   That is the whole system, demonstrated in ten seconds.
9. Place one real order. Confirm it appears in **Orders**, and — if you
   implemented `/reserve` — that your own stock went down by exactly the amount
   sold.

If you also want to sell something your shop does not carry, add it under
**Products → Add product**. It appears in the same list marked _In NCOM_, and can
go into the same offers as anything read from your site.

### Checking a connector automatically

```bash
pnpm check:connector -- \
  --url https://shop.example.com/ncom/v1 \
  --key ncomcat_… --secret ncomsec_…
```

Runs every endpoint in this document against a real connector and reports what
it found: which capabilities it declares, whether it honours `ids`, whether a
missing product answers 404, what its stock endpoint says, and whether
`/reserve` refuses an impossible quantity. Run it before going live and after
any change to the connector.

With no arguments it runs against a fake website built into the script, which is
how NCOM checks that its own signing and parsing still match this document.

### Testing by hand

```bash
BASE="https://shop.example.com/ncom/v1"
KEY="ncomcat_…"
SECRET="ncomsec_…"

T=$(date +%s)
SIG=$(printf '%s.' "$T" | openssl dgst -sha256 -hmac "$SECRET" -hex | sed 's/^.* //')

curl -s "$BASE/ping" \
  -H "X-NCOM-Key: $KEY" \
  -H "X-NCOM-Contract: 1" \
  -H "X-NCOM-Timestamp: $T" \
  -H "X-NCOM-Signature: t=$T,v1=$SIG" | jq
```

(For a `GET` the signed body is the empty string, which is why the `printf` ends
at the dot.)

---

## 9. Where the line falls

Exactly what is stored and what is not, because "we store nothing" is not true
and the difference matters.

**Read from your website, never stored:** the products you keep there — titles,
descriptions, handles, prices, compare-at prices, options, variants, SKUs,
barcodes, weights, images, stock levels, backorder policy, categories.

**Stored by NCOM, because you put it here:** the products you add in NCOM, with
their variants, prices, images and stock. These are yours to edit here and are
not related to your website in any way; NCOM will never push them to it or read
them from it.

**Stored by NCOM, because NCOM produced it:** landing pages and their design,
offers and bundle pricing (which reference product ids from either catalogue),
carts, orders and order lines, customers, discounts, delivery zones, courier
shipments, and the connection settings on this page.

Order lines are the interesting case. They **snapshot** the title, variant title,
SKU, price, weight and image URL at the moment of sale. That is not a cached
catalogue — it is a record of what was sold, at what price, to whom. A merchant
can delete a product tonight and last March's order still reads correctly, which
is the entire reason a snapshot is taken instead of a reference being followed.
