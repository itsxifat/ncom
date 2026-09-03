import { getActiveOrganization } from '@/server/services/organizationService'
import {
  getOrdersForLabels,
  type OrderLabel,
} from '@/server/services/labelService'
import { orderBarcodeSvg } from '@/server/labels/barcode'
import { formatMoney } from '@/lib/money'
import { PrintToolbar } from './print-toolbar'

export const metadata = { title: 'Print' }

/** One print run cannot be unbounded — a runaway `ids` query would render forever. */
const MAX_LABELS = 200

/**
 * Parcel stickers and invoices, laid out for paper.
 *
 * Deliberately outside the dashboard shell. Everything on this page is going
 * through a printer, and a sidebar, a workspace switcher and a dark surface are
 * three things a thermal printer would render as a black rectangle. The page
 * paints itself white and ships its own `@page` rules instead.
 *
 * The two formats answer different jobs. A sticker goes on the parcel and is
 * read by a rider and a scanner: the address, the amount to collect, and a
 * barcode. An invoice goes inside it and is read by the customer: what they
 * bought, at what price, and what is still owed.
 */
export default async function PrintOrdersPage({
  searchParams,
}: PageProps<'/print/orders'>) {
  const query = await searchParams
  const { organization } = await getActiveOrganization()

  const ids =
    typeof query.ids === 'string'
      ? query.ids.split(',').filter(Boolean).slice(0, MAX_LABELS)
      : []
  const format = query.format === 'invoice' ? 'invoice' : 'sticker'

  const labels = await getOrdersForLabels(organization.id, ids)

  return (
    <div className="min-h-screen bg-neutral-100 text-neutral-900 [color-scheme:light]">
      <style>{format === 'sticker' ? STICKER_CSS : INVOICE_CSS}</style>

      <PrintToolbar count={labels.length} format={format} ids={ids} />

      {labels.length === 0 ? (
        <p className="p-10 text-center text-sm text-neutral-500">
          Nothing to print. Select orders on the orders list and choose “Print
          stickers”.
        </p>
      ) : (
        <div className="sheet">
          {labels.map((label) =>
            format === 'sticker' ? (
              <Sticker key={label.id} label={label} />
            ) : (
              <Invoice key={label.id} label={label} />
            )
          )}
        </div>
      )}
    </div>
  )
}

/**
 * 4×6 inches, the size every thermal roll in this market is cut to.
 *
 * `margin: 0` on the page and the padding inside it, rather than the other way
 * round: a thermal printer has no unprintable margin to respect and browsers
 * add half an inch of one unless told not to, which shrinks a 4×6 design onto a
 * 3×5 area and makes the barcode too narrow to read.
 */
const STICKER_CSS = `
  @page { size: 4in 6in; margin: 0; }
  .sheet { display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 16px; }
  .label {
    width: 4in; height: 6in; box-sizing: border-box; padding: 0.22in;
    background: #fff; color: #000; display: flex; flex-direction: column;
    font-size: 11pt; line-height: 1.3;
  }
  @media screen { .label { box-shadow: 0 1px 3px rgba(0,0,0,.2); } }
  @media print {
    .no-print { display: none !important; }
    body { background: #fff !important; }
    .sheet { display: block; gap: 0; padding: 0; }
    .label { box-shadow: none; break-after: page; }
    .label:last-child { break-after: auto; }
  }
`

const INVOICE_CSS = `
  @page { size: A4; margin: 12mm; }
  .sheet { display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 16px; }
  .invoice {
    width: 186mm; box-sizing: border-box; padding: 10mm;
    background: #fff; color: #000; font-size: 10pt; line-height: 1.45;
  }
  @media screen { .invoice { box-shadow: 0 1px 3px rgba(0,0,0,.2); } }
  @media print {
    .no-print { display: none !important; }
    body { background: #fff !important; }
    .sheet { display: block; gap: 0; padding: 0; }
    .invoice { width: auto; padding: 0; box-shadow: none; break-after: page; }
    .invoice:last-child { break-after: auto; }
  }
`

function Barcode({ orderNumber }: { orderNumber: string }) {
  const barcode = orderBarcodeSvg(orderNumber)
  if (!barcode) return null

  return (
    <div
      className="[&>svg]:h-auto [&>svg]:w-full"
      // Generated here from the order number, which is stripped to letters,
      // digits and dashes before it reaches the encoder.
      dangerouslySetInnerHTML={{ __html: barcode.svg }}
    />
  )
}

function Sticker({ label }: { label: OrderLabel }) {
  const units = label.items.reduce((sum, item) => sum + item.quantity, 0)

  return (
    <article className="label">
      <header className="flex items-start justify-between gap-3 border-b border-black pb-2">
        <div className="min-w-0">
          <p className="truncate text-[13pt] font-bold">{label.storeName}</p>
          <p className="text-[9pt]">
            {label.orderNumber} · {label.createdAt.toLocaleDateString()}
          </p>
        </div>
        {/* The number the rider is collecting, in the largest type on the
            sticker. A prepaid parcel says so instead — a courier who reads an
            amount collects it, and collecting twice is the merchant's problem
            to unwind. */}
        <div className="shrink-0 text-right">
          {label.codCents > 0 ? (
            <>
              <p className="text-[8pt] font-semibold tracking-wide uppercase">
                Cash on delivery
              </p>
              <p className="text-[17pt] leading-tight font-black">
                {formatMoney(label.codCents, label.currencyCode)}
              </p>
            </>
          ) : (
            <p className="border border-black px-2 py-1 text-[11pt] font-bold">
              PAID
            </p>
          )}
        </div>
      </header>

      <section className="flex-1 py-2">
        <p className="text-[8pt] font-semibold tracking-wide uppercase">
          Deliver to
        </p>
        <p className="text-[13pt] font-bold">{label.recipient.name}</p>
        {label.recipient.phone && (
          <p className="text-[12pt] font-semibold">{label.recipient.phone}</p>
        )}
        {label.recipient.lines.map((line, index) => (
          <p key={index}>{line}</p>
        ))}

        <p className="mt-2 border-t border-neutral-300 pt-2 text-[9pt]">
          {units} {units === 1 ? 'item' : 'items'}:{' '}
          {label.items
            .map(
              (item) =>
                `${item.quantity}× ${item.title}${
                  item.variantTitle && item.variantTitle !== 'Default Title'
                    ? ` (${item.variantTitle})`
                    : ''
                }`
            )
            .join(', ')}
        </p>

        {label.consignmentId && (
          <p className="text-[9pt]">
            {label.courier} consignment {label.consignmentId}
          </p>
        )}
      </section>

      <footer className="border-t border-black pt-2">
        <Barcode orderNumber={label.orderNumber} />
      </footer>
    </article>
  )
}

function Invoice({ label }: { label: OrderLabel }) {
  const due = Math.max(0, label.totalCents - label.paidCents)

  return (
    <article className="invoice">
      <header className="flex items-start justify-between gap-6 border-b-2 border-black pb-3">
        <div>
          <p className="text-[16pt] leading-tight font-bold">
            {label.storeName}
          </p>
          <p className="text-[9pt]">Invoice {label.orderNumber}</p>
          <p className="text-[9pt]">{label.createdAt.toLocaleString()}</p>
        </div>
        <div className="w-[52mm]">
          <Barcode orderNumber={label.orderNumber} />
        </div>
      </header>

      <section className="flex justify-between gap-8 py-3">
        <div>
          <p className="text-[8pt] font-semibold tracking-wide uppercase">
            Deliver to
          </p>
          <p className="font-semibold">{label.recipient.name}</p>
          {label.recipient.phone && <p>{label.recipient.phone}</p>}
          {label.recipient.lines.map((line, index) => (
            <p key={index}>{line}</p>
          ))}
        </div>
        <div className="text-right">
          <p className="text-[8pt] font-semibold tracking-wide uppercase">
            {due > 0 ? 'Amount due' : 'Paid in full'}
          </p>
          <p className="text-[15pt] font-bold">
            {formatMoney(due > 0 ? due : label.totalCents, label.currencyCode)}
          </p>
          {due > 0 && <p className="text-[9pt]">Cash on delivery</p>}
          {label.consignmentId && (
            <p className="text-[9pt]">
              {label.courier} · {label.consignmentId}
            </p>
          )}
        </div>
      </section>

      <table className="w-full border-collapse">
        <thead>
          <tr className="border-y border-black text-left text-[8pt] uppercase">
            <th className="py-1.5">Item</th>
            <th className="py-1.5 text-right">Qty</th>
            <th className="py-1.5 text-right">Price</th>
            <th className="py-1.5 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {label.items.map((item) => (
            <tr key={item.id} className="border-b border-neutral-300 align-top">
              <td className="py-1.5">
                <span className="font-medium">{item.title}</span>
                {item.variantTitle && item.variantTitle !== 'Default Title' && (
                  <span> — {item.variantTitle}</span>
                )}
                {item.sku && (
                  <span className="block text-[8pt]">SKU {item.sku}</span>
                )}
              </td>
              <td className="py-1.5 text-right">{item.quantity}</td>
              <td className="py-1.5 text-right">
                {formatMoney(item.unitPriceCents, label.currencyCode)}
              </td>
              <td className="py-1.5 text-right">
                {formatMoney(item.totalCents, label.currencyCode)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="mt-3 ml-auto w-[70mm] text-[10pt]">
        <Row
          label="Subtotal"
          value={formatMoney(label.subtotalCents, label.currencyCode)}
        />
        {label.discountCents > 0 && (
          <Row
            // The code is named only when the code is the whole of it. The
            // discount total also carries a bundle's saving, anything given
            // away, and money taken off by hand — printing all of that beside
            // a customer's code told them the code was worth several times
            // what it was, on the document they keep.
            label={
              label.discountCode &&
              label.couponDiscountCents === label.discountCents
                ? `Discount (${label.discountCode})`
                : 'Discount'
            }
            value={`−${formatMoney(label.discountCents, label.currencyCode)}`}
          />
        )}
        <Row
          label={label.shippingMethodTitle ?? 'Delivery'}
          value={formatMoney(label.shippingCents, label.currencyCode)}
        />
        {label.taxCents > 0 && (
          <Row
            label="Tax"
            value={formatMoney(label.taxCents, label.currencyCode)}
          />
        )}
        <div className="mt-1 flex justify-between border-t border-black pt-1 text-[12pt] font-bold">
          <span>Total</span>
          <span>{formatMoney(label.totalCents, label.currencyCode)}</span>
        </div>
        {label.paidCents > 0 && (
          <Row
            label="Paid"
            value={formatMoney(label.paidCents, label.currencyCode)}
          />
        )}
        {due > 0 && (
          <div className="flex justify-between font-semibold">
            <span>Due on delivery</span>
            <span>{formatMoney(due, label.currencyCode)}</span>
          </div>
        )}
      </section>

      {label.note && (
        <p className="mt-4 border-t border-neutral-300 pt-2 text-[9pt]">
          Note: {label.note}
        </p>
      )}

      <p className="mt-6 text-center text-[9pt]">
        Thank you for shopping with {label.storeName}.
      </p>
    </article>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  )
}
