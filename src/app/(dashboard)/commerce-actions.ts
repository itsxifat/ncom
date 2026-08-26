'use server'

/**
 * Commerce server actions, scoped to the organisation.
 *
 * These moved out of the per-store shell when the catalogue, inventory and
 * order book became organisation-wide. A store is a website; products, stock,
 * orders, discounts, shipping and tax settings belong to the business behind
 * it and are shared by every storefront it runs. None of these take a store id
 * — there is nothing store-specific left for them to scope by.
 */

import { revalidatePath } from 'next/cache'
import { recordOrderReturn } from '@/server/services/returnService'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { getActiveOrganization } from '@/server/services/organizationService'
import {
  setOrderStatusColors,
  updateOrganizationSettings,
} from '@/server/services/organizationSettingsService'
import {
  archiveProduct,
  bulkDeleteProducts,
  bulkSetProductStatus,
  duplicateProduct,
  createProduct,
  deleteProduct,
  listPickerProducts,
  updateProduct,
} from '@/server/services/productService'
import {
  createCollection,
  deleteCollection,
  setCollectionProducts,
  updateCollection,
} from '@/server/services/collectionService'
import {
  adjustInventory,
  ensureDefaultLocation,
  listInventoryHistory,
  setVariantStock,
} from '@/server/services/inventoryService'
import {
  addOrderNote,
  cancelOrder,
  markOrderPaid,
  refundOrder,
} from '@/server/services/orderService'
import {
  editOrder,
  previewOrderEdit,
  type OrderEditInput,
  type OrderEditLine,
} from '@/server/services/orderEditService'
import {
  createDiscount,
  deleteDiscount,
  setDiscountActive,
  updateDiscount,
} from '@/server/services/discountService'
import {
  createLocation,
  createShippingRate,
  createShippingZone,
  createTaxRate,
  deleteShippingRate,
  deleteShippingZone,
  deleteTaxRate,
  updateShippingZone,
  upsertPaymentProvider,
} from '@/server/services/shippingService'
import {
  createProductSchema,
  adjustInventorySchema,
} from '@/lib/validation/product'
import { createCollectionSchema } from '@/lib/validation/collection'
import { createDiscountSchema } from '@/lib/validation/discount'
import {
  paymentProviderSchema,
  shippingRateSchema,
  shippingZoneSchema,
  storeSettingsSchema,
  taxRateSchema,
} from '@/lib/validation/store'
import { parseMoneyInput } from '@/lib/money'
import { parseStatusColors } from '@/lib/order-status-colors'

/**
 * Commerce server actions.
 *
 * Two submission styles, chosen per form rather than uniformly:
 *
 *   - Simple forms (settings, a tax rate) post plain FormData.
 *   - Forms with nested repeating structure (a product and its variants, a
 *     discount and its codes) post one JSON field. FormData cannot represent
 *     an array of objects without inventing a key-encoding convention, and
 *     hand-rolled `variants[0][price]` parsing is exactly the kind of code
 *     that silently drops a row.
 *
 * Money arrives as major units — what the merchant typed — and is converted to
 * minor units here, on the server, in one place. See lib/money.ts.
 */

export type StoreActionState = { error?: string; success?: string } | undefined

async function org() {
  const { organization } = await getActiveOrganization()
  return organization.id
}

function fail(cause: unknown): StoreActionState {
  return {
    error: cause instanceof Error ? cause.message : 'Something went wrong',
  }
}

function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0]
  return issue
    ? `${issue.path.join('.') || 'Form'}: ${issue.message}`
    : 'Invalid input'
}

// ── Store settings ───────────────────────────────────────────────────────

export async function updateOrganizationSettingsAction(
  _prev: StoreActionState,
  formData: FormData
): Promise<StoreActionState> {
  const parsed = storeSettingsSchema.safeParse({
    currencyCode: formData.get('currencyCode'),
    weightUnit: formData.get('weightUnit'),
    pricesIncludeTax: formData.get('pricesIncludeTax') === 'on',
    taxesIncludedInShipping: formData.get('taxesIncludedInShipping') === 'on',
    customerAccountsEnabled: formData.get('customerAccountsEnabled') === 'on',
    requiresCustomerAccount: formData.get('requiresCustomerAccount') === 'on',
    allowOutOfStockPurchase: formData.get('allowOutOfStockPurchase') === 'on',
    orderNumberPrefix: formData.get('orderNumberPrefix') ?? '#',
    orderNumberSuffix: formData.get('orderNumberSuffix') ?? '',
    supportEmail: formData.get('supportEmail') ?? '',
    supportPhone: formData.get('supportPhone') ?? '',
    businessName: formData.get('businessName') ?? '',
  })

  if (!parsed.success) return { error: firstIssue(parsed.error) }

  try {
    await updateOrganizationSettings(await org(), {
      ...parsed.data,
      supportEmail: parsed.data.supportEmail || null,
      supportPhone: parsed.data.supportPhone || null,
      businessName: parsed.data.businessName || null,
    })
  } catch (cause) {
    return fail(cause)
  }

  revalidatePath('/settings')
  return { success: 'Settings saved.' }
}

// ── Products ─────────────────────────────────────────────────────────────

/**
 * The shape the product form posts. Prices are strings because that is what a
 * merchant types; they become integer minor units below.
 */
const productFormSchema = z.object({
  title: z.string(),
  handle: z.string().optional(),
  description: z.string().optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']),
  productType: z.string().optional(),
  vendor: z.string().optional(),
  tags: z.array(z.string()).default([]),
  // Sent on every save, and null is meaningful: it is how the editor says the
  // product was taken out of its category.
  categoryId: z.string().nullable().default(null),
  seoTitle: z.string().optional(),
  seoDescription: z.string().optional(),
  options: z
    .array(
      z.object({
        name: z.string(),
        position: z.number(),
        values: z.array(z.string()),
      })
    )
    .default([]),
  images: z
    .array(
      z.object({
        mediaId: z.string(),
        altText: z.string().optional(),
        position: z.number(),
      })
    )
    .default([]),
  variants: z
    .array(
      z.object({
        id: z.string().optional(),
        sku: z.string().optional(),
        barcode: z.string().optional(),
        price: z.string(),
        compareAtPrice: z.string().optional(),
        cost: z.string().optional(),
        option1: z.string().optional().nullable(),
        option2: z.string().optional().nullable(),
        option3: z.string().optional().nullable(),
        isTaxable: z.boolean().default(true),
        inventoryTracked: z.boolean().default(true),
        inventoryPolicy: z.enum(['DENY', 'CONTINUE']).default('DENY'),
        requiresShipping: z.boolean().default(true),
        weightGrams: z.number().default(0),
        position: z.number().default(1),
        /** Which gallery image this variant shows, named by mediaId. */
        imageId: z.string().optional().nullable(),
      })
    )
    .default([]),
})

function toProductInput(
  raw: z.infer<typeof productFormSchema>,
  currencyCode: string
) {
  const money = (value: string | undefined) =>
    value && value.trim() !== '' ? parseMoneyInput(value, currencyCode) : null

  return {
    ...raw,
    // Blank optional text fields are dropped rather than saved as "" so the
    // column stays null and "has no vendor" reads the same everywhere.
    handle: raw.handle || undefined,
    description: raw.description || undefined,
    productType: raw.productType || undefined,
    vendor: raw.vendor || undefined,
    // Kept as an explicit null rather than collapsed to undefined: undefined
    // means "not mentioned" downstream, which would make clearing a category
    // silently do nothing.
    categoryId: raw.categoryId || null,
    seoTitle: raw.seoTitle || undefined,
    seoDescription: raw.seoDescription || undefined,
    images: raw.images.map((image) => ({
      mediaId: image.mediaId,
      altText: image.altText || undefined,
      position: image.position,
    })),
    variants: raw.variants.map((variant) => ({
      ...variant,
      sku: variant.sku || undefined,
      barcode: variant.barcode || undefined,
      priceCents: money(variant.price) ?? 0,
      compareAtPriceCents: money(variant.compareAtPrice),
      costCents: money(variant.cost),
      imageId: variant.imageId || undefined,
    })),
  }
}

async function organizationCurrency(organizationId: string): Promise<string> {
  const { getOrganizationSettings } =
    await import('@/server/services/organizationSettingsService')
  const settings = await getOrganizationSettings(organizationId)
  return settings?.currencyCode ?? 'USD'
}

export async function saveProductAction(
  productId: string | null,
  _prev: StoreActionState,
  formData: FormData
): Promise<StoreActionState> {
  let payload: unknown
  try {
    payload = JSON.parse(String(formData.get('payload') ?? '{}'))
  } catch {
    return { error: 'Could not read the form' }
  }

  const form = productFormSchema.safeParse(payload)
  if (!form.success) return { error: firstIssue(form.error) }

  let newId: string | null = null

  try {
    const organizationId = await org()
    const currency = await organizationCurrency(organizationId)
    const input = createProductSchema.safeParse(
      toProductInput(form.data, currency)
    )
    if (!input.success) return { error: firstIssue(input.error) }

    if (productId) {
      await updateProduct(organizationId, productId, input.data)
    } else {
      const created = await createProduct(organizationId, input.data)
      newId = created.id
    }
  } catch (cause) {
    return fail(cause)
  }

  revalidatePath('/products')

  if (newId) redirect(`/products/${newId}`)
  return { success: 'Product saved.' }
}

export async function archiveProductAction(
  productId: string
): Promise<StoreActionState> {
  try {
    await archiveProduct(await org(), productId)
  } catch (cause) {
    return fail(cause)
  }

  revalidatePath('/products')
  return { success: 'Product archived.' }
}

export async function deleteProductAction(
  productId: string
): Promise<StoreActionState> {
  try {
    await deleteProduct(await org(), productId)
  } catch (cause) {
    return fail(cause)
  }

  revalidatePath('/products')
  redirect('/products')
}

export async function duplicateProductAction(
  productId: string
): Promise<StoreActionState> {
  let newId: string | null = null
  try {
    const created = await duplicateProduct(await org(), productId)
    newId = created.id
  } catch (cause) {
    return fail(cause)
  }

  revalidatePath('/products')
  redirect(`/products/${newId}`)
}

export async function bulkProductStatusAction(
  productIds: string[],
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED'
): Promise<StoreActionState> {
  let count = 0
  try {
    const result = await bulkSetProductStatus(await org(), productIds, status)
    count = result.count
  } catch (cause) {
    return fail(cause)
  }

  revalidatePath('/products')
  const label =
    status === 'ACTIVE'
      ? 'published'
      : status === 'DRAFT'
        ? 'moved to draft'
        : 'archived'
  return { success: `${count} product${count === 1 ? '' : 's'} ${label}.` }
}

export async function bulkDeleteProductsAction(
  productIds: string[]
): Promise<StoreActionState> {
  let result: { deleted: number; blocked: string[] }
  try {
    result = await bulkDeleteProducts(await org(), productIds)
  } catch (cause) {
    return fail(cause)
  }

  revalidatePath('/products')

  // A partial result is reported as a partial result. Saying "5 deleted" when
  // two were refused would leave the merchant believing their catalogue is in
  // a state it is not.
  if (result.blocked.length > 0) {
    const names = result.blocked.slice(0, 3).join(', ')
    const more =
      result.blocked.length > 3 ? ` and ${result.blocked.length - 3} more` : ''
    return {
      error:
        `${result.deleted} deleted. ${names}${more} ` +
        `appear on existing orders — archive those instead.`,
    }
  }

  return {
    success: `${result.deleted} product${result.deleted === 1 ? '' : 's'} deleted.`,
  }
}

// ── Inventory ────────────────────────────────────────────────────────────

export async function adjustInventoryAction(
  _prev: StoreActionState,
  formData: FormData
): Promise<StoreActionState> {
  // Parsed explicitly rather than through `Number()`: `Number('')` and
  // `Number(null)` are both 0, so a blank box used to submit a valid-looking
  // zero-unit adjustment and write a meaningless ledger row.
  const raw = String(formData.get('delta') ?? '').trim()
  if (raw === '') return { error: 'Enter how many units to add or remove.' }

  const delta = Number(raw)
  if (!Number.isInteger(delta)) {
    return { error: 'Enter a whole number, like 12 or -3.' }
  }

  const parsed = adjustInventorySchema.safeParse({
    variantId: formData.get('variantId'),
    locationId: formData.get('locationId'),
    delta,
    reason: formData.get('reason') || 'MANUAL',
    note: formData.get('note') || undefined,
  })

  if (!parsed.success) return { error: firstIssue(parsed.error) }

  try {
    const { organization, session } = await getActiveOrganizationWithSession()
    await adjustInventory(organization, parsed.data, session)
  } catch (cause) {
    return fail(cause)
  }

  revalidatePath('/inventory')
  revalidatePath('/products')
  return {
    success:
      delta > 0 ? `Added ${delta} to stock.` : `Removed ${Math.abs(delta)}.`,
  }
}

/**
 * Signed stock change from the inventory table's +/− buttons.
 *
 * Separate from the FormData action because there is no form here — the row
 * calls it directly with a delta, and routing that through a hidden form only
 * to parse it back would add a failure mode without adding anything.
 */
export async function adjustInventoryDeltaAction(
  variantId: string,
  locationId: string,
  delta: number
): Promise<StoreActionState> {
  if (!Number.isInteger(delta) || delta === 0) {
    return { error: 'Enter a whole number of units.' }
  }

  try {
    const { organization, session } = await getActiveOrganizationWithSession()
    const location = locationId
      ? { id: locationId }
      : await ensureDefaultLocation(organization)

    await adjustInventory(
      organization,
      {
        variantId,
        locationId: location.id,
        delta,
        reason: delta > 0 ? 'RECEIVED' : 'MANUAL',
        note: 'Adjusted from the inventory table',
      },
      session
    )
  } catch (cause) {
    return fail(cause)
  }

  revalidatePath('/inventory')
  revalidatePath('/products')
  return { success: 'Stock updated.' }
}

/**
 * Catalogue search for the product pickers.
 *
 * Server-side rather than filtering a preloaded list in the browser: a picker
 * that quietly cannot find products past its first page is worse than one with
 * no search, because the merchant concludes the product does not exist.
 */
export async function searchCatalogAction(
  query: string,
  includeArchived = false
) {
  const { organization } = await getActiveOrganization()

  return listPickerProducts(organization.id, {
    search: query,
    includeArchived,
    take: 60,
  })
}

/** The ledger behind one variant's current count, for the history dialog. */
export async function inventoryHistoryAction(variantId: string) {
  const { organization } = await getActiveOrganization()
  const entries = await listInventoryHistory(organization.id, variantId)

  return entries.map((entry) => ({
    ...entry,
    createdAt: entry.createdAt.toISOString(),
  }))
}

/**
 * Sets a variant's stock to a typed-in count.
 *
 * Separate from adjustInventoryAction because the two express different
 * intents: an adjustment is "twelve arrived", a set is "I counted, there are
 * forty-two". Both land in the same ledger — see setVariantStock.
 */
export async function setVariantStockAction(
  variantId: string,
  available: number,
  locationId?: string
): Promise<StoreActionState> {
  if (!Number.isFinite(available) || available < 0) {
    return { error: 'Enter a stock count of zero or more.' }
  }

  try {
    const { organization, session } = await getActiveOrganizationWithSession()
    await setVariantStock(organization, variantId, available, session, {
      locationId,
    })
  } catch (cause) {
    return fail(cause)
  }

  revalidatePath('/inventory')
  revalidatePath('/products')
  return { success: 'Stock updated.' }
}

async function getActiveOrganizationWithSession() {
  const { organization, session } = await getActiveOrganization()
  return { organization: organization.id, session: session.user.id }
}

// ── Collections ──────────────────────────────────────────────────────────

const collectionFormSchema = z.object({
  title: z.string(),
  handle: z.string().optional(),
  description: z.string().optional(),
  type: z.enum(['MANUAL', 'AUTOMATED']),
  rulesMatch: z.enum(['ALL', 'ANY']),
  sortOrder: z.enum([
    'MANUAL',
    'BEST_SELLING',
    'TITLE_ASC',
    'TITLE_DESC',
    'PRICE_ASC',
    'PRICE_DESC',
    'CREATED_ASC',
    'CREATED_DESC',
  ]),
  rules: z
    .array(
      z.object({
        field: z.string(),
        operator: z.string(),
        value: z.string(),
      })
    )
    .default([]),
  productIds: z.array(z.string()).default([]),
  seoTitle: z.string().optional(),
  seoDescription: z.string().optional(),
})

export async function saveCollectionAction(
  collectionId: string | null,
  _prev: StoreActionState,
  formData: FormData
): Promise<StoreActionState> {
  let payload: unknown
  try {
    payload = JSON.parse(String(formData.get('payload') ?? '{}'))
  } catch {
    return { error: 'Could not read the form' }
  }

  const form = collectionFormSchema.safeParse(payload)
  if (!form.success) return { error: firstIssue(form.error) }

  const input = createCollectionSchema.safeParse({
    ...form.data,
    handle: form.data.handle || undefined,
    description: form.data.description || undefined,
    seoTitle: form.data.seoTitle || undefined,
    seoDescription: form.data.seoDescription || undefined,
  })
  if (!input.success) return { error: firstIssue(input.error) }

  let newId: string | null = null

  try {
    const organizationId = await org()

    if (collectionId) {
      await updateCollection(organizationId, collectionId, input.data)
    } else {
      const created = await createCollection(organizationId, input.data)
      newId = created.id
    }

    if (input.data.type === 'MANUAL') {
      await setCollectionProducts(
        organizationId,
        collectionId ?? newId!,
        form.data.productIds
      )
    }
  } catch (cause) {
    return fail(cause)
  }

  revalidatePath('/collections')

  if (newId) redirect(`/collections/${newId}`)
  return { success: 'Collection saved.' }
}

export async function deleteCollectionAction(
  collectionId: string
): Promise<StoreActionState> {
  try {
    await deleteCollection(await org(), collectionId)
  } catch (cause) {
    return fail(cause)
  }

  revalidatePath('/collections')
  redirect('/collections')
}

// ── Orders ───────────────────────────────────────────────────────────────

export async function refundOrderAction(
  orderId: string,
  _prev: StoreActionState,
  formData: FormData
): Promise<StoreActionState> {
  let lines: { orderLineId: string; quantity: number }[]
  try {
    lines = JSON.parse(String(formData.get('lines') ?? '[]'))
  } catch {
    return { error: 'Could not read the form' }
  }

  try {
    const organizationId = await org()
    const currency = await organizationCurrency(organizationId)
    const shippingRaw = String(formData.get('shipping') ?? '').trim()

    await refundOrder(organizationId, orderId, {
      lines,
      shippingCents: shippingRaw ? parseMoneyInput(shippingRaw, currency) : 0,
      reason: (formData.get('reason') as string) || undefined,
      note: (formData.get('note') as string) || undefined,
      restock: formData.get('restock') === 'on',
    })
  } catch (cause) {
    return fail(cause)
  }

  revalidatePath(`/orders/${orderId}`)
  return { success: 'Refund recorded.' }
}

export async function recordReturnAction(
  orderId: string,
  _prev: StoreActionState,
  formData: FormData
): Promise<StoreActionState> {
  let lines: { orderLineId: string; quantity: number }[]
  try {
    lines = JSON.parse(String(formData.get('lines') ?? '[]'))
  } catch {
    return { error: 'Could not read the form' }
  }

  try {
    await recordOrderReturn(await org(), orderId, {
      lines,
      waiveDeliveryCharge: formData.get('waiveDelivery') === 'on',
      restock: formData.get('restock') === 'on',
      note: (formData.get('note') as string) || undefined,
    })
  } catch (cause) {
    return fail(cause)
  }

  revalidatePath(`/orders/${orderId}`)
  return { success: 'Return recorded.' }
}

/**
 * Saves an edited order.
 *
 * The whole basket is posted as one JSON field rather than a diff: the merchant
 * is looking at the finished basket while the customer is still on the phone,
 * and a stream of add/remove commands would apply in an order nobody chose if
 * the page was stale. The server diffs it against what is stored.
 */
/**
 * The whole edit, as one JSON payload.
 *
 * One blob rather than a field per control because the editor is a live
 * calculator: it previews the same payload against the server as the merchant
 * types, and a preview built from different fields than the save would defeat
 * the point of previewing.
 */
const orderEditSchema = z.object({
  lines: z
    .array(
      z.object({
        orderLineId: z.string().max(40).nullish(),
        variantId: z.string().max(40).nullish(),
        quantity: z.number().int().min(0).max(10_000),
        isGift: z.boolean().default(false),
      })
    )
    .min(1),
  shipping: z.string().max(30).optional(),
  waiveShipping: z.boolean().default(false),
  /** Undefined re-judges the order's own code; null takes it off. */
  discountCode: z.string().max(60).nullish(),
  extraDiscount: z.string().max(30).optional(),
  extraDiscountReason: z.string().max(200).optional(),
  reason: z.string().max(500).optional(),
})

async function toOrderEditInput(
  organizationId: string,
  raw: unknown
): Promise<{ ok: true; input: OrderEditInput } | { ok: false; error: string }> {
  const parsed = orderEditSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }

  const currency = await organizationCurrency(organizationId)
  const shipping = parsed.data.shipping?.trim()
  const extra = parsed.data.extraDiscount?.trim()

  return {
    ok: true,
    input: {
      lines: parsed.data.lines as OrderEditLine[],
      shippingCents: shipping ? parseMoneyInput(shipping, currency) : undefined,
      waiveShipping: parsed.data.waiveShipping,
      // A blank string is the merchant clearing the field, which is a removal;
      // an absent key is them not touching it. Zod's nullish keeps the two
      // apart and so must this.
      discountCode:
        parsed.data.discountCode === undefined
          ? undefined
          : parsed.data.discountCode?.trim() || null,
      manualDiscountCents: extra ? parseMoneyInput(extra, currency) : 0,
      manualDiscountReason: parsed.data.extraDiscountReason,
      reason: parsed.data.reason,
    },
  }
}

export async function editOrderAction(
  orderId: string,
  _prev: StoreActionState,
  formData: FormData
): Promise<StoreActionState> {
  let raw: unknown
  try {
    raw = JSON.parse(String(formData.get('edit') ?? '{}'))
  } catch {
    return { error: 'Could not read the form' }
  }

  try {
    const organizationId = await org()
    const parsed = await toOrderEditInput(organizationId, raw)
    if (!parsed.ok) return { error: parsed.error }

    await editOrder(organizationId, orderId, parsed.input)
  } catch (cause) {
    return fail(cause)
  }

  revalidatePath(`/orders/${orderId}`)
  revalidatePath('/orders')
  return { success: 'Order updated.' }
}

/**
 * What the edit on screen would cost, without committing it.
 *
 * The offer and the discount code are re-judged against the basket as it now
 * stands, so a merchant is told "SAVE500 no longer applies — the basket is
 * below the minimum spend" while they can still do something about it, rather
 * than discovering the total moved after they saved.
 */
export async function previewOrderEditAction(
  orderId: string,
  raw: unknown
): Promise<
  | { ok: true; quote: Awaited<ReturnType<typeof previewOrderEdit>> }
  | { ok: false; error: string }
> {
  try {
    const organizationId = await org()
    const parsed = await toOrderEditInput(organizationId, raw)
    if (!parsed.ok) return { ok: false, error: parsed.error }

    return {
      ok: true,
      quote: await previewOrderEdit(organizationId, orderId, parsed.input),
    }
  } catch (cause) {
    return {
      ok: false,
      error:
        cause instanceof Error ? cause.message : 'Could not price the edit',
    }
  }
}

/**
 * Saves the order list's colour coding.
 *
 * Posted as JSON because it is a map, and revalidates `/orders` rather than the
 * settings page — the colours are the thing that changed, and the list is where
 * the merchant is standing when they change them.
 */
export async function saveOrderStatusColorsAction(
  _prev: StoreActionState,
  formData: FormData
): Promise<StoreActionState> {
  let raw: unknown
  try {
    raw = JSON.parse(String(formData.get('colors') ?? '{}'))
  } catch {
    return { error: 'Could not read the colours' }
  }

  try {
    await setOrderStatusColors(await org(), parseStatusColors(raw))
  } catch (cause) {
    return fail(cause)
  }

  revalidatePath('/orders')
  return { success: 'Colours saved.' }
}

export async function cancelOrderAction(
  orderId: string,
  _prev: StoreActionState,
  formData: FormData
): Promise<StoreActionState> {
  const reason = String(formData.get('reason') ?? 'OTHER') as
    'CUSTOMER' | 'FRAUD' | 'INVENTORY' | 'DECLINED' | 'OTHER'

  try {
    await cancelOrder(await org(), orderId, {
      reason,
      restock: formData.get('restock') === 'on',
    })
  } catch (cause) {
    return fail(cause)
  }

  revalidatePath(`/orders/${orderId}`)
  // The order book shows the cancellation now that there is one status rather
  // than two, so it has to be rebuilt as well — leaving it stale is how a
  // merchant cancels an order, goes back, and reads "Pending" again. The label
  // queue drops the order for the same reason.
  revalidatePath('/orders')
  revalidatePath('/labels')
  return { success: 'Order cancelled.' }
}

export async function markOrderPaidAction(
  orderId: string
): Promise<StoreActionState> {
  try {
    await markOrderPaid(await org(), orderId)
  } catch (cause) {
    return fail(cause)
  }

  revalidatePath(`/orders/${orderId}`)
  return { success: 'Payment recorded.' }
}

export async function addOrderNoteAction(
  orderId: string,
  _prev: StoreActionState,
  formData: FormData
): Promise<StoreActionState> {
  const note = String(formData.get('note') ?? '').trim()
  if (!note) return { error: 'Enter a note' }

  try {
    await addOrderNote(await org(), orderId, note)
  } catch (cause) {
    return fail(cause)
  }

  revalidatePath(`/orders/${orderId}`)
  return { success: 'Note added.' }
}

// ── Discounts ────────────────────────────────────────────────────────────

const discountFormSchema = z.object({
  title: z.string(),
  method: z.enum(['CODE', 'AUTOMATIC']),
  type: z.enum(['PERCENTAGE', 'FIXED_AMOUNT', 'FREE_SHIPPING', 'BUY_X_GET_Y']),
  percentage: z.string().optional(),
  amount: z.string().optional(),
  maxDiscount: z.string().optional(),
  storeIds: z.array(z.string()).default([]),
  appliesTo: z.enum(['ALL', 'PRODUCTS', 'COLLECTIONS', 'VARIANTS']),
  targetProductIds: z.array(z.string()).default([]),
  targetCollectionIds: z.array(z.string()).default([]),
  targetVariantIds: z.array(z.string()).default([]),
  excludedProductIds: z.array(z.string()).default([]),
  excludedVariantIds: z.array(z.string()).default([]),
  minimumSubtotal: z.string().optional(),
  minimumQuantity: z.string().optional(),
  buyQuantity: z.string().optional(),
  getQuantity: z.string().optional(),
  usageLimit: z.string().optional(),
  oncePerCustomer: z.boolean().default(false),
  combinesWithOther: z.boolean().default(false),
  startsAt: z.string(),
  endsAt: z.string().optional(),
  isActive: z.boolean().default(true),
  codes: z.array(z.string()).default([]),
})

export async function saveDiscountAction(
  discountId: string | null,
  _prev: StoreActionState,
  formData: FormData
): Promise<StoreActionState> {
  let payload: unknown
  try {
    payload = JSON.parse(String(formData.get('payload') ?? '{}'))
  } catch {
    return { error: 'Could not read the form' }
  }

  const form = discountFormSchema.safeParse(payload)
  if (!form.success) return { error: firstIssue(form.error) }

  let newId: string | null = null

  try {
    const organizationId = await org()
    const currency = await organizationCurrency(organizationId)

    const optionalInt = (value: string | undefined) =>
      value && value.trim() !== '' ? Number(value) : null
    const optionalMoney = (value: string | undefined) =>
      value && value.trim() !== '' ? parseMoneyInput(value, currency) : null

    const input = createDiscountSchema.safeParse({
      ...form.data,
      // Percentages are entered as "10" and stored as 1000 basis points.
      valueBps: form.data.percentage
        ? Math.round(Number(form.data.percentage) * 100)
        : null,
      valueCents: optionalMoney(form.data.amount),
      // Only a percentage has a ceiling. Carrying one over from a campaign that
      // used to be a percentage would silently shrink a "500 off" rule.
      maxDiscountCents:
        form.data.type === 'PERCENTAGE'
          ? optionalMoney(form.data.maxDiscount)
          : null,
      minimumSubtotalCents: optionalMoney(form.data.minimumSubtotal),
      minimumQuantity: optionalInt(form.data.minimumQuantity),
      buyQuantity: optionalInt(form.data.buyQuantity),
      getQuantity: optionalInt(form.data.getQuantity),
      usageLimit: optionalInt(form.data.usageLimit),
      startsAt: new Date(form.data.startsAt),
      endsAt: form.data.endsAt ? new Date(form.data.endsAt) : null,
    })

    if (!input.success) return { error: firstIssue(input.error) }

    if (discountId) {
      await updateDiscount(organizationId, discountId, input.data)
    } else {
      const created = await createDiscount(organizationId, input.data)
      newId = created.id
    }
  } catch (cause) {
    return fail(cause)
  }

  revalidatePath('/discounts')

  if (newId) redirect(`/discounts/${newId}`)
  return { success: 'Discount saved.' }
}

export async function toggleDiscountAction(
  discountId: string,
  isActive: boolean
): Promise<StoreActionState> {
  try {
    await setDiscountActive(await org(), discountId, isActive)
  } catch (cause) {
    return fail(cause)
  }

  revalidatePath('/discounts')
  return { success: isActive ? 'Discount activated.' : 'Discount paused.' }
}

export async function deleteDiscountAction(
  discountId: string
): Promise<StoreActionState> {
  try {
    await deleteDiscount(await org(), discountId)
  } catch (cause) {
    return fail(cause)
  }

  revalidatePath('/discounts')
  redirect('/discounts')
}

// ── Shipping, tax, locations, payments ───────────────────────────────────

export async function createShippingZoneAction(
  _prev: StoreActionState,
  formData: FormData
): Promise<StoreActionState> {
  const parsed = shippingZoneSchema.safeParse({
    name: formData.get('name'),
    countryCodes: String(formData.get('countryCodes') ?? '')
      .split(',')
      .map((code) => code.trim())
      .filter(Boolean),
  })
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  try {
    await createShippingZone(await org(), parsed.data)
  } catch (cause) {
    return fail(cause)
  }

  revalidatePath('/settings/shipping')
  return { success: 'Zone created.' }
}

export async function updateShippingZoneAction(
  zoneId: string,
  _prev: StoreActionState,
  formData: FormData
): Promise<StoreActionState> {
  const parsed = shippingZoneSchema.safeParse({
    name: formData.get('name'),
    countryCodes: String(formData.get('countryCodes') ?? '')
      .split(',')
      .map((code) => code.trim())
      .filter(Boolean),
  })
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  try {
    await updateShippingZone(await org(), zoneId, parsed.data)
  } catch (cause) {
    return fail(cause)
  }

  revalidatePath('/settings/shipping')
  return { success: 'Zone updated.' }
}

export async function deleteShippingZoneAction(
  zoneId: string
): Promise<StoreActionState> {
  try {
    await deleteShippingZone(await org(), zoneId)
  } catch (cause) {
    return fail(cause)
  }

  revalidatePath('/settings/shipping')
  return { success: 'Zone deleted.' }
}

export async function createShippingRateAction(
  zoneId: string,
  _prev: StoreActionState,
  formData: FormData
): Promise<StoreActionState> {
  try {
    const organizationId = await org()
    const currency = await organizationCurrency(organizationId)

    const optionalMoney = (name: string) => {
      const raw = String(formData.get(name) ?? '').trim()
      return raw ? parseMoneyInput(raw, currency) : null
    }
    const optionalInt = (name: string) => {
      const raw = String(formData.get(name) ?? '').trim()
      return raw ? Number(raw) : null
    }

    const parsed = shippingRateSchema.safeParse({
      name: formData.get('name'),
      description: formData.get('description') || undefined,
      priceCents: parseMoneyInput(
        String(formData.get('price') ?? '0'),
        currency
      ),
      minSubtotalCents: optionalMoney('minSubtotal'),
      maxSubtotalCents: optionalMoney('maxSubtotal'),
      minWeightGrams: optionalInt('minWeight'),
      maxWeightGrams: optionalInt('maxWeight'),
      position: Number(formData.get('position') ?? 0),
    })
    if (!parsed.success) return { error: firstIssue(parsed.error) }

    await createShippingRate(organizationId, zoneId, parsed.data)
  } catch (cause) {
    return fail(cause)
  }

  revalidatePath('/settings/shipping')
  return { success: 'Rate added.' }
}

export async function deleteShippingRateAction(
  rateId: string
): Promise<StoreActionState> {
  try {
    await deleteShippingRate(await org(), rateId)
  } catch (cause) {
    return fail(cause)
  }

  revalidatePath('/settings/shipping')
  return { success: 'Rate deleted.' }
}

export async function createTaxRateAction(
  _prev: StoreActionState,
  formData: FormData
): Promise<StoreActionState> {
  const percent = Number(formData.get('percent') ?? 0)

  const parsed = taxRateSchema.safeParse({
    name: formData.get('name'),
    countryCode: formData.get('countryCode'),
    provinceCode: formData.get('provinceCode') || null,
    rateBps: Math.round(percent * 100),
    appliesToShipping: formData.get('appliesToShipping') === 'on',
    taxCode: formData.get('taxCode') || null,
  })
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  try {
    await createTaxRate(await org(), parsed.data)
  } catch (cause) {
    return fail(cause)
  }

  revalidatePath('/settings/taxes')
  return { success: 'Tax rate added.' }
}

export async function deleteTaxRateAction(
  taxRateId: string
): Promise<StoreActionState> {
  try {
    await deleteTaxRate(await org(), taxRateId)
  } catch (cause) {
    return fail(cause)
  }

  revalidatePath('/settings/taxes')
  return { success: 'Tax rate deleted.' }
}

export async function createLocationAction(
  _prev: StoreActionState,
  formData: FormData
): Promise<StoreActionState> {
  try {
    await createLocation(await org(), {
      name: String(formData.get('name') ?? ''),
      isActive: true,
      fulfillsOnlineOrders: true,
    })
  } catch (cause) {
    return fail(cause)
  }

  revalidatePath('/settings/locations')
  return { success: 'Location added.' }
}

export async function savePaymentProviderAction(
  _prev: StoreActionState,
  formData: FormData
): Promise<StoreActionState> {
  const credentials: Record<string, string> = {}
  for (const [key, value] of formData.entries()) {
    if (key.startsWith('credential.') && typeof value === 'string') {
      credentials[key.slice('credential.'.length)] = value
    }
  }

  const parsed = paymentProviderSchema.safeParse({
    provider: formData.get('provider'),
    displayName: formData.get('displayName'),
    isEnabled: formData.get('isEnabled') === 'on',
    testMode: formData.get('testMode') === 'on',
    instructions: formData.get('instructions') || undefined,
    credentials,
  })
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  try {
    await upsertPaymentProvider(await org(), parsed.data)
  } catch (cause) {
    return fail(cause)
  }

  revalidatePath('/settings/payments')
  return { success: 'Payment method saved.' }
}
