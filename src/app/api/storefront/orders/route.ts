import { NextResponse } from 'next/server'
import { cookies, headers } from 'next/headers'
import { z } from 'zod'
import { offerOrderSchema } from '@/lib/validation/offerOrder'
import { placeOfferOrder } from '@/server/services/offerOrderService'
import { getStoreForSeoRoutes } from '@/server/services/publishService'
import { queuePurchaseConversion } from '@/server/services/trackingService'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { tenantSubdomain } from '@/lib/tenant-host'
import { env } from '@/lib/env'

/**
 * Takes an order from a landing page's cash-on-delivery form.
 *
 * This is the endpoint that makes a builder page a shop rather than a picture
 * of one. It is deliberately public and unauthenticated — the buyer is a
 * stranger with a phone number — so the defences that matter are here:
 *
 *   Store identity comes from the request's own hostname, never from the
 *   posted body. A form served from `acme.example.com` can only create orders
 *   for `acme`, so a scraped form re-posted with someone else's storeId does
 *   nothing. The body's `storeId` is checked for a mismatch and rejected, and
 *   `pageId` is checked against that store inside the service.
 *
 *   Rate limited per IP and per store, because a public order form with no
 *   payment step is the cheapest spam target on the platform: there is no card
 *   to decline, so nothing else stops a script filling a merchant's admin with
 *   junk and reserving their whole inventory.
 *
 *   Every figure is recomputed server-side. The body names an offer and some
 *   variants; offerService prices them from the database and checkoutService
 *   decides what is charged. See those for what is and is not trusted.
 */

/** Per-IP: enough for a mistyped retry, not enough to script. */
const IP_LIMIT = 5
const IP_WINDOW_SECONDS = 60

/** Per-store ceiling, so one target cannot be flooded from many addresses. */
const STORE_LIMIT = 60
const STORE_WINDOW_SECONDS = 60

export async function POST(request: Request) {
  const headerList = await headers()
  const host = headerList.get('host') ?? ''
  const subdomain = subdomainFromHost(host)

  if (!subdomain) {
    return NextResponse.json(
      { error: 'Orders can only be placed from a storefront address' },
      { status: 400 }
    )
  }

  const store = await getStoreForSeoRoutes(subdomain)
  if (!store) {
    return NextResponse.json({ error: 'Store not found' }, { status: 404 })
  }

  const ip = await getClientIp()
  const [perIp, perStore] = await Promise.all([
    checkRateLimit(`offer-order:ip:${ip}`, IP_LIMIT, IP_WINDOW_SECONDS),
    checkRateLimit(
      `offer-order:store:${store.id}`,
      STORE_LIMIT,
      STORE_WINDOW_SECONDS
    ),
  ])

  if (!perIp.allowed || !perStore.allowed) {
    const retryAfter =
      perIp.retryAfterSeconds ?? perStore.retryAfterSeconds ?? 60
    return NextResponse.json(
      { error: 'Too many orders from here. Please try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    )
  }

  let body: unknown
  try {
    body = await parseBody(request)
  } catch {
    return NextResponse.json(
      { error: 'Could not read that submission' },
      { status: 400 }
    )
  }

  const parsed = offerOrderSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: firstMessage(parsed.error),
        fields: z.treeifyError(parsed.error),
      },
      { status: 400 }
    )
  }

  // The hostname is the authority; a body naming a different store is either a
  // stale cached form or someone probing, and neither should create an order.
  if (parsed.data.storeId !== store.id) {
    return NextResponse.json(
      { error: 'This form belongs to a different store' },
      { status: 400 }
    )
  }

  try {
    const result = await placeOfferOrder(
      store.organizationId,
      store.id,
      parsed.data
    )

    const tracking = await reportConversion(store.id, result.orderId, ip)

    return NextResponse.json({
      ok: true,
      orderNumber: result.orderNumber,
      totalCents: result.totalCents,
      currencyCode: result.currencyCode,
      offerLabel: result.offerLabel,
      quantity: result.quantity,
      // What the browser's Meta pixel should repeat, if there is one. Null when
      // the store reports from the browser only, or not at all.
      tracking,
    })
  } catch (cause) {
    // Checkout failures here are the buyer's business — "out of stock", "we do
    // not ship to that address" — so the message is passed through rather than
    // flattened, and anything unexpected is not.
    const message =
      cause instanceof Error ? cause.message : 'Could not place the order'
    console.error(`Offer order failed for store ${store.id}:`, cause)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

/**
 * Reports the sale to the store's ad platforms, and tells the browser what to
 * repeat.
 *
 * Runs after the order exists, and never in a way that can affect it: a
 * merchant losing a sale because Meta was slow would be a far worse bug than
 * the missing conversion. `queuePurchaseConversion` swallows its own failures
 * for that reason, and this only adds the request-shaped context it cannot
 * gather for itself.
 *
 * The page URL comes from the `Referer` header rather than the request body.
 * The order form posts here from the landing page, so the browser sends it
 * automatically, and taking it from the body instead would let a scraped form
 * write any URL it liked into the merchant's ad reporting.
 */
async function reportConversion(storeId: string, orderId: string, ip: string) {
  const [headerList, cookieStore] = await Promise.all([headers(), cookies()])
  const referer = headerList.get('referer')

  return queuePurchaseConversion({
    storeId,
    orderId,
    sourceUrl: referer ?? `https://${headerList.get('host') ?? ''}`,
    request: {
      headers: headerList,
      // No proxy-set headers on this request: `/api/*` is deliberately excluded
      // from the storefront rewrite, so the cookies that rewrite planted on the
      // landing view are the whole story here — which is exactly what they were
      // planted for.
      cookies: cookieStore,
      ip: ip === 'unknown' ? null : ip,
      userAgent: headerList.get('user-agent'),
    },
  })
}

/**
 * Accepts both a JSON body and a classic form post.
 *
 * The order-form section submits with `fetch`, but a merchant pasting their own
 * markup will write a plain `<form method="post">`, and that must work too — it
 * is the form most landing-page authors know how to write. Such a form cannot
 * express nested selections, so a flat `variantId`/`quantity` pair is accepted
 * and folded into a one-line selection.
 */
async function parseBody(request: Request): Promise<unknown> {
  const contentType = request.headers.get('content-type') ?? ''

  if (contentType.includes('application/json')) {
    return request.json()
  }

  const formData = await request.formData()
  const flat = Object.fromEntries(
    [...formData.entries()].map(([key, value]) => [key, String(value)])
  )

  if (!flat.selections && flat.variantId) {
    return {
      ...flat,
      selections: [
        {
          productId: flat.productId ?? flat.variantId,
          variantId: flat.variantId,
          quantity: flat.quantity ?? 1,
        },
      ],
    }
  }

  // A hand-written form may send `selections` as a JSON string.
  if (typeof flat.selections === 'string') {
    try {
      return { ...flat, selections: JSON.parse(flat.selections) }
    } catch {
      return flat
    }
  }

  return flat
}

/**
 * The tenant subdomain for this request, or null when the host is not a
 * storefront address.
 *
 * Custom domains are not resolved here yet: an order posted from a verified
 * custom domain would need a `Store.customDomain` lookup, and until that path
 * is wired the safe answer is to refuse rather than guess which store owns the
 * request.
 */
function subdomainFromHost(host: string): string | null {
  return tenantSubdomain(host, env.ROOT_DOMAIN)
}

function firstMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Please check the form and try again'
}
