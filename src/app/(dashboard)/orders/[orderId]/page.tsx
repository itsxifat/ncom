import { notFound } from 'next/navigation'
import { Gift, Printer, Receipt } from 'lucide-react'
import { getActiveOrganization } from '@/server/services/organizationService'
import { getOrder, orderLineImageUrl } from '@/server/services/orderService'
import { orderEditability } from '@/server/services/orderEditService'
import { listLocations } from '@/server/services/shippingService'
import {
  getShipmentForOrder,
  trackingUrlFor,
} from '@/server/services/courierService'
import { listCourierConfigs } from '@/server/services/courierConfigService'
import { CourierPanel } from '@/components/store/courier-panel'
import { WorkflowStateBadge } from '@/components/store/fraud-badges'
import { formatMoney } from '@/lib/money'
import { orderStatus } from '@/lib/order-status'
import { PageHeader } from '@/components/app/page-header'
import { LocalTime } from '@/components/app/local-time'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { FinancialStatusBadge } from '@/components/store/status-badges'
import {
  CancelOrderPanel,
  MarkPaidButton,
  OrderNoteForm,
  RefundPanel,
  ReturnPanel,
} from '@/components/store/order-actions'
import { OrderEditor } from '@/components/store/order-editor'
import { Money } from '@/components/store/form-controls'
import { ProductThumb } from '@/components/media/product-thumb'

interface AddressShape {
  firstName?: string
  lastName?: string
  company?: string
  address1?: string
  address2?: string
  city?: string
  provinceCode?: string
  countryCode?: string
  postalCode?: string
  phone?: string
}

function AddressBlock({ address }: { address: unknown }) {
  if (!address || typeof address !== 'object') {
    return <p className="text-muted-foreground text-sm">Not provided</p>
  }

  const value = address as AddressShape
  const lines = [
    [value.firstName, value.lastName].filter(Boolean).join(' '),
    value.company,
    value.address1,
    value.address2,
    [value.city, value.provinceCode, value.postalCode]
      .filter(Boolean)
      .join(' '),
    value.countryCode,
    value.phone,
  ].filter((line) => typeof line === 'string' && line.trim().length > 0)

  return (
    <address className="text-sm not-italic">
      {lines.map((line, index) => (
        <div key={index}>{line}</div>
      ))}
    </address>
  )
}

export default async function OrderDetailPage({
  params,
}: PageProps<'/orders/[orderId]'>) {
  const { orderId } = await params
  const { organization } = await getActiveOrganization()

  let order
  try {
    order = await getOrder(organization.id, orderId)
  } catch {
    notFound()
  }

  const [locations, shipment, courierConfigs] = await Promise.all([
    listLocations(organization.id),
    getShipmentForOrder(organization.id, order.id),
    listCourierConfigs(organization.id),
  ])

  const currency = order.currencyCode

  const lineSummaries = order.lines.map((line) => ({
    id: line.id,
    title: line.title,
    imageUrl: orderLineImageUrl(line),
    variantTitle: line.variantTitle,
    quantity: line.quantity,
    refundedQuantity: line.refundedQuantity,
    returnedQuantity: line.returnedQuantity,
    unitPriceCents: line.unitPriceCents,
  }))

  const refundableCents = order.paidTotalCents - order.refundedTotalCents
  const outstandingCents = order.totalCents - order.paidTotalCents

  // ── What the discount is actually made of ──────────────────────────────
  //
  // `discountTotalCents` is the sum of four separate things — the code, the
  // campaign's own saving, gifts given away, and money granted by hand — and
  // none of them can be recovered from it afterwards, which is why each is
  // recorded on its own. This page used to show the sum as "Discount" and then
  // show one of its parts again as "Extra discount", so the column stopped
  // adding up: a merchant reading it back subtracted the goodwill twice and
  // landed short of the total by exactly that amount. It also labelled the
  // whole sum with the discount code, crediting a typed code for the bundle
  // saving and the gift.
  //
  // Each part is now its own row, and the rows sum to the discount that was
  // taken off the total.
  const giftDiscountCents = order.lines
    .filter((line) => line.isGift)
    .reduce((sum, line) => sum + line.totalDiscountCents, 0)

  // Whatever the recorded parts do not account for is the campaign's own
  // saving, which is not stored separately. It can come out negative on an
  // order written before these columns existed, or one where the total was
  // clamped to the subtotal — there is nothing honest to break down in that
  // case, so the single figure is shown instead of a set of rows that disagree
  // with it.
  const otherDiscountCents =
    order.discountTotalCents -
    (order.couponDiscountCents + order.manualDiscountCents + giftDiscountCents)
  const discountBreaksDown =
    order.discountTotalCents > 0 && otherDiscountCents >= 0

  // An offer order names its campaign. An order whose code's own worth was
  // never recorded — every order placed before that column was filled in —
  // has its whole remainder credited to the code, which is where it came from.
  const otherDiscountLabel =
    order.offerLabel ??
    (order.discountCode && order.couponDiscountCents === 0
      ? `Discount (${order.discountCode})`
      : 'Discount')

  // The order's one status, and the single question every action below asks of
  // it. The page used to read the two columns separately — a workflow badge
  // beside a "Cancelled" badge, and every guard keyed on `cancelledAt` alone —
  // which is what let this page and the order list disagree.
  const status = orderStatus(order)
  const cancelled = status === 'CANCELLED'

  // Whether the goods can still be changed — decided by the same function the
  // service enforces with, so the button and the save agree.
  const { editable, reason: notEditableReason } = orderEditability(order)

  const editableLines = order.lines.map((line) => ({
    id: line.id,
    variantId: line.variantId,
    title: line.title,
    variantTitle: line.variantTitle,
    sku: line.sku,
    imageUrl: orderLineImageUrl(line),
    quantity: line.quantity,
    unitPriceCents: line.unitPriceCents,
    totalDiscountCents: line.totalDiscountCents,
    isGift: line.isGift,
    settledQuantity: Math.max(line.refundedQuantity, line.returnedQuantity),
  }))

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        backHref={`/orders`}
        backLabel="Orders"
        eyebrow={<LocalTime at={order.createdAt.toISOString()} />}
        title={order.orderNumber}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <FinancialStatusBadge status={order.financialStatus} />
            {/* Where the parcel is, which is a different question from
                whether the order is paid. A cancelled order reads "Cancelled"
                here rather than carrying a second badge that contradicts the
                first. */}
            <WorkflowStateBadge state={status} />
            {/* Which storefront this order came through. Nullable because the
                catalogue outlives any one site: a deleted landing page must not
                take its orders with it. */}
            {order.store ? (
              <Badge variant="outline">via {order.store.name}</Badge>
            ) : (
              <Badge variant="outline">Store removed</Badge>
            )}
            {/* Which landing page and which of its offers produced the sale.
                The offer label is a copy taken at checkout, so it still reads
                correctly after the offer is renamed or deleted. */}
            {order.page && <Badge variant="outline">{order.page.title}</Badge>}
            {order.offerLabel && (
              <Badge variant="secondary">{order.offerLabel}</Badge>
            )}
          </span>
        }
        actions={
          !cancelled && outstandingCents > 0 ? (
            <MarkPaidButton orderId={order.id} />
          ) : undefined
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex flex-col gap-6">
          {/* First in the column, above the items: when an order is held for
              review this is the only thing on the page that needs a decision,
              and burying it under a price breakdown is how held orders sit for
              a day. */}
          <CourierPanel
            orderId={order.id}
            workflowState={status}
            cancelled={cancelled}
            fraud={{
              verdict: order.fraudVerdict,
              reason: order.fraudReason,
              checkedAt: order.fraudCheckedAt?.toISOString() ?? null,
              delivered: order.fraudDelivered,
              cancelled: order.fraudCancelled,
              frauds: order.fraudReports,
              successRateBps: order.fraudSuccessRateBps,
            }}
            shipment={
              shipment
                ? {
                    provider: shipment.provider,
                    status: shipment.status,
                    statusMessage: shipment.statusMessage,
                    consignmentId: shipment.consignmentId,
                    trackingCode: shipment.trackingCode,
                    trackingUrl: trackingUrlFor(
                      shipment.provider,
                      shipment.trackingCode ?? shipment.consignmentId
                    ),
                    lastError: shipment.lastError,
                    dispatchedAt: shipment.dispatchedAt?.toISOString() ?? null,
                    deliveredAt: shipment.deliveredAt?.toISOString() ?? null,
                    events: shipment.events.map((event) => ({
                      id: event.id,
                      status: event.status,
                      message: event.message,
                      occurredAt: event.occurredAt.toISOString(),
                      source: event.source,
                    })),
                  }
                : null
            }
            providers={courierConfigs
              .filter((config) => config.isEnabled)
              .map((config) => ({
                provider: config.provider,
                label: config.displayName,
                isDefault: config.isDefault,
              }))}
            outstandingCents={outstandingCents}
            currencyCode={currency}
            trackingToken={order.trackingToken}
          />

          <Card>
            <CardContent className="flex flex-col gap-4">
              <h2 className="font-display text-lg font-semibold tracking-tight">
                Items
              </h2>

              <div className="divide-border/60 flex flex-col divide-y">
                {order.lines.map((line) => (
                  <div
                    key={line.id}
                    className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="flex min-w-0 gap-3">
                      {/* What a packer actually recognises the goods by. Click
                          for the full picture — the thumbnail is too small to
                          tell two colourways apart. */}
                      <ProductThumb
                        src={orderLineImageUrl(line)}
                        alt={line.title}
                      />
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 font-medium">
                          {line.title}
                          {line.isGift && (
                            <Badge variant="lime">
                              <Gift className="size-3" />
                              Gift
                            </Badge>
                          )}
                        </p>
                        {line.variantTitle &&
                          line.variantTitle !== 'Default Title' && (
                            <p className="text-muted-foreground text-sm">
                              {line.variantTitle}
                            </p>
                          )}
                        <p className="text-muted-foreground mt-1 text-sm">
                          {line.sku && <>SKU {line.sku} · </>}
                          {formatMoney(line.unitPriceCents, currency)} ×{' '}
                          {line.quantity}
                          {line.returnedQuantity > 0 && (
                            <> · {line.returnedQuantity} returned</>
                          )}
                          {line.refundedQuantity > 0 && (
                            <> · {line.refundedQuantity} refunded</>
                          )}
                        </p>
                      </div>
                    </div>
                    {/* A gift shows the word rather than a price of zero. It is
                        not a line sold at nothing — it is a line not sold — and
                        the value it was worth is still on the row below, so the
                        merchant can see what the goodwill cost them. */}
                    <div className="text-right">
                      {line.isGift ? (
                        <p className="text-sm font-semibold">Gift</p>
                      ) : (
                        <Money>{formatMoney(line.totalCents, currency)}</Money>
                      )}
                      {line.totalDiscountCents > 0 && (
                        <p className="text-muted-foreground text-xs">
                          {line.isGift ? 'worth ' : '−'}
                          {formatMoney(line.totalDiscountCents, currency)}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <dl className="border-border/60 flex flex-col gap-1.5 border-t pt-4 text-sm">
                <Row
                  label="Subtotal"
                  value={formatMoney(order.subtotalCents, currency)}
                />
                {!discountBreaksDown && order.discountTotalCents > 0 && (
                  <Row
                    label={`Discount${order.discountCode ? ` (${order.discountCode})` : ''}`}
                    value={`−${formatMoney(order.discountTotalCents, currency)}`}
                  />
                )}
                {discountBreaksDown && (
                  <>
                    {order.couponDiscountCents > 0 && (
                      <Row
                        label={`Discount${order.discountCode ? ` (${order.discountCode})` : ''}`}
                        value={`−${formatMoney(order.couponDiscountCents, currency)}`}
                      />
                    )}
                    {otherDiscountCents > 0 && (
                      <Row
                        label={otherDiscountLabel}
                        value={`−${formatMoney(otherDiscountCents, currency)}`}
                      />
                    )}
                    {giftDiscountCents > 0 && (
                      <Row
                        label={
                          order.lines.filter((line) => line.isGift).length === 1
                            ? 'Gift'
                            : 'Gifts'
                        }
                        value={`−${formatMoney(giftDiscountCents, currency)}`}
                      />
                    )}
                    {order.manualDiscountCents > 0 && (
                      <Row
                        label={`Extra discount${
                          order.manualDiscountReason
                            ? ` (${order.manualDiscountReason})`
                            : ''
                        }`}
                        value={`−${formatMoney(order.manualDiscountCents, currency)}`}
                      />
                    )}
                  </>
                )}
                <Row
                  label={order.shippingMethodTitle ?? 'Shipping'}
                  value={
                    order.shippingWaived
                      ? 'Waived'
                      : formatMoney(order.shippingTotalCents, currency)
                  }
                />
                <Row
                  label="Tax"
                  value={formatMoney(order.taxTotalCents, currency)}
                />
                <div className="border-border/60 mt-2 flex justify-between border-t pt-2 text-base font-semibold">
                  <dt>Total</dt>
                  <dd>{formatMoney(order.totalCents, currency)}</dd>
                </div>
                {order.paidTotalCents > 0 && (
                  <Row
                    label="Paid"
                    value={formatMoney(order.paidTotalCents, currency)}
                  />
                )}
                {order.refundedTotalCents > 0 && (
                  <Row
                    label="Refunded"
                    value={`−${formatMoney(order.refundedTotalCents, currency)}`}
                  />
                )}
                {outstandingCents > 0 && (
                  <Row
                    label="Outstanding"
                    value={formatMoney(outstandingCents, currency)}
                  />
                )}
              </dl>
            </CardContent>
          </Card>

          <div className="flex flex-wrap items-start gap-3">
            {/* The single-order version of what /labels does in bulk. A parcel
                that has to be reprinted — smudged sticker, wrong printer, one
                order packed late — is one order, and sending someone back to a
                list to tick it is a step with no decision in it. */}
            <Button
              variant="outline"
              nativeButton={false}
              render={
                <a
                  href={`/print/orders?ids=${order.id}&format=sticker`}
                  target="_blank"
                  rel="noreferrer"
                />
              }
            >
              <Printer />
              Print sticker
            </Button>
            <Button
              variant="outline"
              nativeButton={false}
              render={
                <a
                  href={`/print/orders?ids=${order.id}&format=invoice`}
                  target="_blank"
                  rel="noreferrer"
                />
              }
            >
              <Receipt />
              Print invoice
            </Button>

            {/* First in the row, ahead of the money actions. A customer
                ringing to change their order is the common case; refunding and
                cancelling are the exceptions, and they are also the ones that
                cannot be undone. */}
            <OrderEditor
              orderId={order.id}
              orderNumber={order.orderNumber}
              currencyCode={currency}
              lines={editableLines}
              shippingCents={order.shippingTotalCents}
              shippingWaived={order.shippingWaived}
              discountCode={order.discountCode}
              manualDiscountCents={order.manualDiscountCents}
              taxTotalCents={order.taxTotalCents}
              totalCents={order.totalCents}
              editable={editable}
              notEditableReason={notEditableReason}
            />

            {!cancelled && (
              <RefundPanel
                orderId={order.id}
                lines={lineSummaries}
                currencyCode={currency}
                refundableCents={refundableCents}
              />
            )}
            {!cancelled && (
              <ReturnPanel
                orderId={order.id}
                lines={lineSummaries}
                currencyCode={currency}
              />
            )}
            {!cancelled && <CancelOrderPanel orderId={order.id} />}
          </div>

          <Card>
            <CardContent className="flex flex-col gap-3">
              <h2 className="font-display text-lg font-semibold tracking-tight">
                Timeline
              </h2>
              <ol className="flex flex-col gap-3">
                {order.events.map((event) => (
                  <li key={event.id} className="flex gap-3 text-sm">
                    <span className="bg-lime mt-1.5 size-2 shrink-0 rounded-full" />
                    <div>
                      <p>{event.message}</p>
                      <LocalTime
                        at={event.createdAt.toISOString()}
                        className="text-muted-foreground block text-xs"
                      />
                    </div>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>

        <aside className="flex flex-col gap-6">
          <Card>
            <CardContent className="flex flex-col gap-4">
              <h2 className="font-display text-lg font-semibold tracking-tight">
                Customer
              </h2>
              <div className="text-sm">
                <p className="font-medium">
                  {[order.customer?.firstName, order.customer?.lastName]
                    .filter(Boolean)
                    .join(' ') || 'Guest'}
                </p>
                <p className="text-muted-foreground">{order.email}</p>
                {order.phone && (
                  <p className="text-muted-foreground">{order.phone}</p>
                )}
              </div>

              <div>
                <p className="text-muted-foreground mb-1 text-xs font-medium uppercase">
                  Shipping address
                </p>
                <AddressBlock address={order.shippingAddress} />
              </div>

              <div>
                <p className="text-muted-foreground mb-1 text-xs font-medium uppercase">
                  Billing address
                </p>
                <AddressBlock address={order.billingAddress} />
              </div>
            </CardContent>
          </Card>

          {order.transactions.length > 0 && (
            <Card>
              <CardContent className="flex flex-col gap-3">
                <h2 className="font-display text-lg font-semibold tracking-tight">
                  Payments
                </h2>
                {order.transactions.map((transaction) => (
                  <div
                    key={transaction.id}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <div>
                      <p className="font-medium">
                        {transaction.kind.toLowerCase()}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {transaction.provider} ·{' '}
                        {transaction.processedAt.toLocaleDateString()}
                      </p>
                    </div>
                    <Money>
                      {formatMoney(
                        transaction.amountCents,
                        transaction.currencyCode
                      )}
                    </Money>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent>
              <OrderNoteForm orderId={order.id} note={order.note} />
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}
