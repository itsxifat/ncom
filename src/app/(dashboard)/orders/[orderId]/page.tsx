import { notFound } from 'next/navigation'
import { getActiveOrganization } from '@/server/services/organizationService'
import { getOrder } from '@/server/services/orderService'
import { listLocations } from '@/server/services/shippingService'
import {
  getShipmentForOrder,
  trackingUrlFor,
} from '@/server/services/courierService'
import { listCourierConfigs } from '@/server/services/courierConfigService'
import { CourierPanel } from '@/components/store/courier-panel'
import { WorkflowStateBadge } from '@/components/store/fraud-badges'
import { formatMoney } from '@/lib/money'
import { PageHeader } from '@/components/app/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { FinancialStatusBadge } from '@/components/store/status-badges'
import {
  CancelOrderPanel,
  MarkPaidButton,
  OrderNoteForm,
  RefundPanel,
  ReturnPanel,
} from '@/components/store/order-actions'
import { Money } from '@/components/store/form-controls'

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
    variantTitle: line.variantTitle,
    quantity: line.quantity,
    refundedQuantity: line.refundedQuantity,
    returnedQuantity: line.returnedQuantity,
    unitPriceCents: line.unitPriceCents,
  }))

  const refundableCents = order.paidTotalCents - order.refundedTotalCents
  const outstandingCents = order.totalCents - order.paidTotalCents

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        backHref={`/orders`}
        backLabel="Orders"
        eyebrow={order.createdAt.toLocaleString()}
        title={order.orderNumber}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <FinancialStatusBadge status={order.financialStatus} />
            {/* Where the parcel is, which is a different question from
                whether the order is paid. */}
            <WorkflowStateBadge state={order.workflowState} />
            {order.cancelledAt && (
              <Badge variant="destructive">Cancelled</Badge>
            )}
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
          !order.cancelledAt && outstandingCents > 0 ? (
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
            workflowState={order.workflowState}
            cancelled={Boolean(order.cancelledAt)}
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
                    <div className="min-w-0">
                      <p className="font-medium">{line.title}</p>
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
                    <div className="text-right">
                      <Money>{formatMoney(line.totalCents, currency)}</Money>
                      {line.totalDiscountCents > 0 && (
                        <p className="text-muted-foreground text-xs">
                          −{formatMoney(line.totalDiscountCents, currency)}
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
                {order.discountTotalCents > 0 && (
                  <Row
                    label={`Discount${order.discountCode ? ` (${order.discountCode})` : ''}`}
                    value={`−${formatMoney(order.discountTotalCents, currency)}`}
                  />
                )}
                <Row
                  label={order.shippingMethodTitle ?? 'Shipping'}
                  value={formatMoney(order.shippingTotalCents, currency)}
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
            {!order.cancelledAt && (
              <RefundPanel
                orderId={order.id}
                lines={lineSummaries}
                currencyCode={currency}
                refundableCents={refundableCents}
              />
            )}
            {!order.cancelledAt && (
              <ReturnPanel
                orderId={order.id}
                lines={lineSummaries}
                currencyCode={currency}
              />
            )}
            {!order.cancelledAt && <CancelOrderPanel orderId={order.id} />}
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
                      <p className="text-muted-foreground text-xs">
                        {event.createdAt.toLocaleString()}
                      </p>
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
