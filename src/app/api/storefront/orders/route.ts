import { NextResponse } from 'next/server'
import { cookies, headers } from 'next/headers'
import { z } from 'zod'
import { offerOrderSchema } from '@/lib/validation/offerOrder'
import {
  OrderFormAnswerError,
  placeOfferOrder,
} from '@/server/services/offerOrderService'
import { getStoreForSeoRoutes } from '@/server/services/publishService'
import { queuePurchaseConversion } from '@/server/services/trackingService'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { tenantSubdomain } from '@/lib/tenant-host'
import { env } from '@/lib/env'
import { latinDigits } from '@/modules/sections/language'
import { checkoutIssueMessage } from '@/modules/storefront/checkout-shared'
import { storeText } from '@/modules/storefront/i18n'

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

  // The order form shows whatever this replies, so it replies in the page's
  // language. English keeps its precise wording; a Bangla page gets the shop
  // dictionary's sentences, because "A valid phone number is required" in red
  // on a Bangla form helps nobody who cannot read it.
  const text = storeText(store.theme)
  const errors = text.words.errors
  const english = text.language === 'en'

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
      {
        error: english
          ? 'Too many orders from here. Please try again shortly.'
          : errors.tooManyAttemptsWait,
      },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    )
  }

  let body: unknown
  try {
    body = await parseBody(request)
  } catch {
    return NextResponse.json(
      { error: english ? 'Could not read that submission' : errors.invalid },
      { status: 400 }
    )
  }

  const parsed = offerOrderSchema.safeParse(withLatinPhone(body))
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return NextResponse.json(
      {
        error: issue
          ? checkoutIssueMessage(issue, text)
          : english
            ? 'Please check the form and try again'
            : errors.invalid,
        fields: z.treeifyError(parsed.error),
      },
      { status: 400 }
    )
  }

  // The hostname is the authority; a body naming a different store is either a
  // stale cached form or someone probing, and neither should create an order.
  if (parsed.data.storeId !== store.id) {
    return NextResponse.json(
      {
        error: english
          ? 'This form belongs to a different store'
          : errors.couldNotPlace,
      },
      { status: 400 }
    )
  }

  try {
    const result = await placeOfferOrder(
      store.organizationId,
      store.id,
      parsed.data
    )

    // Null when the merchant's own website is the one reporting this sale, and
    // null is the whole suppression: it stops the server's copy here, and the
    // browser mirrors nothing without it, so neither half of the pair fires.
    // Anything less would leave the pixel firing from the page and the double
    // count exactly where it was.
    const tracking = result.reportPurchase
      ? await reportConversion(store.id, result.orderId, ip)
      : null

    return NextResponse.json({
      ok: true,
      orderNumber: result.orderNumber,
      totalCents: result.totalCents,
      currencyCode: result.currencyCode,
      offerLabel: result.offerLabel,
      quantity: result.quantity,
      // What the browser's Meta pixel should repeat, if there is one. Null when
      // the store reports from the browser only, not at all, or — for an order
      // handed to the merchant's website — when their site is the reporter.
      tracking,
    })
  } catch (cause) {
    // One of the merchant's own questions left blank, or answered with
    // something it does not offer. Named, in the page's language, so the buyer
    // knows which box to fill in; nothing was reserved for them yet.
    if (cause instanceof OrderFormAnswerError) {
      return NextResponse.json(
        {
          error:
            cause.reason === 'missing'
              ? errors.answerQuestion(cause.question)
              : errors.chooseAnAnswer(cause.question),
        },
        { status: 400 }
      )
    }
    // Checkout failures here are the buyer's business — "out of stock", "we do
    // not ship to that address" — so the message is passed through rather than
    // flattened, on a page that speaks the language it is written in. A Bangla
    // page gets its own sentence instead, as the store checkout does.
    const message = !english
      ? errors.couldNotPlace
      : cause instanceof Error
        ? cause.message
        : 'Could not place the order'
    console.error(`Offer order failed for store ${store.id}:`, cause)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

/**
 * The submission with its phone number written in 0-9.
 *
 * A buyer on a Bangla keyboard types "০১৭১২৩৪৫৬৭৮". It is a real number, but
 * stored like that the courier booking and the fraud check — which read
 * digits as 0-9 — find no number in it at all, so it is converted before the
 * order is validated and saved. Done here rather than in the form so a
 * merchant's hand-written `<form method="post">` is covered too.
 */
function withLatinPhone(body: unknown): unknown {
  if (!body || typeof body !== 'object') return body
  const phone = (body as { phone?: unknown }).phone
  return typeof phone === 'string'
    ? { ...body, phone: latinDigits(phone) }
    : body
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
