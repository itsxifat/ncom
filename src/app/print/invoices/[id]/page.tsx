import { notFound } from 'next/navigation'
import { auth } from '@/server/auth/auth'
import { prisma } from '@/server/db/client'
import { loadInvoice, type InvoiceView } from '@/server/billing/invoices'
import { vatLabel } from '@/server/billing/tax'
import { formatMoney } from '@/lib/money'
import { InvoiceToolbar } from './invoice-toolbar'

export const metadata = { title: 'Invoice' }

/**
 * One of NCOM's own invoices — a plan, an add-on, AI credits — laid out for
 * A4, with Enfinito as the seller as the CRM prints it (the same invoice, with
 * the same number, is in the CRM's books). Outside the dashboard shell for the
 * same reason as the order print pages: it is going to paper or a PDF.
 *
 * Readable by the workspace's members and by platform admins.
 */
export default async function InvoicePrintPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const invoice = await loadInvoice(Number(id))
  if (!invoice) notFound()

  const session = await auth()
  if (!session?.user) notFound()
  const admin = session.user.platformRole === 'SUPER_ADMIN'
  if (!admin) {
    const member = invoice.organizationId
      ? await prisma.membership.findUnique({
          where: {
            userId_organizationId: {
              userId: session.user.id,
              organizationId: invoice.organizationId,
            },
          },
          select: { id: true },
        })
      : null
    if (!member) notFound()
  }

  return (
    <div className="min-h-screen bg-neutral-100 text-neutral-900 [color-scheme:light]">
      <style>{INVOICE_CSS}</style>
      <InvoiceToolbar
        number={invoice.number}
        backHref={
          admin && !invoice.organizationId ? '/admin/payments' : '/billing'
        }
      />
      <div className="sheet">
        <InvoiceDocument invoice={invoice} />
      </div>
    </div>
  )
}

const STATUS: Record<InvoiceView['status'], { label: string; tone: string }> = {
  PAID: { label: 'Paid', tone: 'paid' },
  UNPAID: { label: 'Unpaid', tone: 'due' },
  VOID: { label: 'Cancelled', tone: 'void' },
}

function day(date: Date | null): string {
  if (!date) return '—'
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dhaka',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

const METHOD_LABELS: Record<string, string> = {
  bkash: 'bKash',
  nagad: 'Nagad',
  rocket: 'Rocket',
  card: 'card',
  bank: 'bank transfer',
  cash: 'cash',
}

function InvoiceDocument({ invoice }: { invoice: InvoiceView }) {
  const money = (cents: number) => formatMoney(cents, invoice.currencyCode)
  const taka = (amount: number) =>
    formatMoney(Math.round(amount * 100), invoice.currencyCode)
  const seller = invoice.crm?.seller ?? invoice.seller
  const isVat = invoice.vatTreatment !== 'NONE'
  const status = STATUS[invoice.status]
  const received = invoice.payments
    .filter((p) => p.status === 'SUCCEEDED')
    .reduce((sum, p) => sum + p.amountCents, 0)
  const refunded = invoice.payments
    .filter((p) => p.status === 'REFUNDED')
    .reduce((sum, p) => sum + p.amountCents, 0)
  const due =
    invoice.status === 'UNPAID' ? Math.max(0, invoice.totalCents - received) : 0

  return (
    <article className="invoice">
      <header className="head">
        <div>
          <p className="seller-name">{seller?.name || 'Enfinito'}</p>
          <div className="muted small">
            {seller?.address && <p>{seller.address}</p>}
            {[seller?.phone, seller?.email, seller?.website]
              .filter(Boolean)
              .join(' · ') && (
              <p>
                {[seller?.phone, seller?.email, seller?.website]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            )}
            {(seller?.bin || seller?.tin) && (
              <p>
                {seller?.bin && `BIN ${seller.bin}`}
                {seller?.bin && seller?.tin && ' · '}
                {seller?.tin && `TIN ${seller.tin}`}
              </p>
            )}
            {seller?.tradeLicense && <p>Trade licence {seller.tradeLicense}</p>}
          </div>
        </div>
        <div className="title-block">
          <p className="title">{isVat ? 'VAT invoice' : 'Invoice'}</p>
          <p className="number">{invoice.number}</p>
          <p className={`status ${status.tone}`}>{status.label}</p>
        </div>
      </header>

      <section className="meta">
        <div>
          <p className="label">Billed to</p>
          <p className="strong">{invoice.buyer.name}</p>
          <div className="muted small">
            {invoice.buyer.address && <p>{invoice.buyer.address}</p>}
            <p>
              {[invoice.buyer.email, invoice.buyer.phone]
                .filter(Boolean)
                .join(' · ')}
            </p>
            {invoice.crm?.buyerBin && <p>BIN {invoice.crm.buyerBin}</p>}
            {invoice.crm?.clientCode && (
              <p>Client code {invoice.crm.clientCode}</p>
            )}
          </div>
        </div>
        <dl className="dates">
          <div>
            <dt>{invoice.status === 'PAID' ? 'Issued' : 'Raised'}</dt>
            <dd>{day(invoice.paidAt ?? invoice.createdAt)}</dd>
          </div>
          {invoice.status === 'PAID' && invoice.paidAt && (
            <div>
              <dt>Ordered</dt>
              <dd>{day(invoice.createdAt)}</dd>
            </div>
          )}
          {invoice.status === 'VOID' && (
            <div>
              <dt>Cancelled</dt>
              <dd>{day(invoice.voidedAt)}</dd>
            </div>
          )}
          {isVat && invoice.serviceCode && (
            <div>
              <dt>Service code</dt>
              <dd>{invoice.serviceCode}</dd>
            </div>
          )}
        </dl>
      </section>

      <table className="lines">
        <thead>
          <tr>
            <th className="num">#</th>
            <th>Description</th>
            <th className="num">Qty</th>
            <th className="num">Rate</th>
            <th className="num">Amount</th>
          </tr>
        </thead>
        <tbody>
          {invoice.lines.map((line, i) => (
            <tr key={i}>
              <td className="num muted">{i + 1}</td>
              <td>{line.description}</td>
              <td className="num">{line.quantity}</td>
              <td className="num">{taka(line.rate)}</td>
              <td className="num">{taka(line.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="totals">
        <dl>
          <div>
            <dt>Subtotal</dt>
            <dd>{money(invoice.subtotalCents)}</dd>
          </div>
          {invoice.discountCents > 0 && (
            <div>
              <dt>Discount</dt>
              <dd>−{money(invoice.discountCents)}</dd>
            </div>
          )}
          {isVat && invoice.discountCents > 0 && (
            <div>
              <dt>Taxable value</dt>
              <dd>{money(invoice.subtotalCents - invoice.discountCents)}</dd>
            </div>
          )}
          {invoice.sdCents > 0 && (
            <div>
              <dt>Supplementary duty ({invoice.sdRate}%)</dt>
              <dd>{money(invoice.sdCents)}</dd>
            </div>
          )}
          {isVat && (
            <div>
              <dt>{vatLabel(invoice.vatTreatment, invoice.vatRate)}</dt>
              <dd>{money(invoice.vatCents)}</dd>
            </div>
          )}
          <div className="grand">
            <dt>Total</dt>
            <dd>{money(invoice.totalCents)}</dd>
          </div>
          {invoice.status === 'PAID' && received > 0 && (
            <div>
              <dt>Paid</dt>
              <dd>{money(received)}</dd>
            </div>
          )}
          {refunded > 0 && (
            <div>
              <dt>Refunded</dt>
              <dd>{money(refunded)}</dd>
            </div>
          )}
          {due > 0 && (
            <div className="grand due">
              <dt>Due</dt>
              <dd>{money(due)}</dd>
            </div>
          )}
        </dl>
      </section>

      {invoice.payments.length > 0 && (
        <section className="payments small">
          <p className="label">Payments</p>
          {invoice.payments.map((p) => (
            <p key={p.id}>
              {money(p.amountCents)} on {day(p.paidAt)}
              {p.method === 'ENFINITO_PAY'
                ? ` through Enfinito Pay${p.channel ? ` (${METHOD_LABELS[p.channel.toLowerCase()] ?? p.channel})` : ''}`
                : ' received by NCOM'}
              {p.transactionId && ` · transaction ${p.transactionId}`}
              {p.status === 'REFUNDED' && ' · refunded'}
            </p>
          ))}
        </section>
      )}

      <footer className="foot small muted">
        <p>
          {invoice.description} · NCOM, websites and online stores by{' '}
          {seller?.name || 'Enfinito'}.
        </p>
        {isVat && invoice.pricesIncludeVat && (
          <p>VAT is included in NCOM’s prices.</p>
        )}
        {invoice.status === 'VOID' && (
          <p>This order was cancelled before it was paid. Nothing is owed.</p>
        )}
      </footer>
    </article>
  )
}

const INVOICE_CSS = `
  @page { size: A4; margin: 14mm; }
  .sheet { display: flex; justify-content: center; padding: 24px 16px; }
  .invoice {
    width: 100%; max-width: 186mm; box-sizing: border-box; padding: 12mm 11mm;
    background: #fff; color: #111; font-size: 10pt; line-height: 1.5;
    box-shadow: 0 1px 3px rgba(0,0,0,.18);
  }
  .invoice p { margin: 0; }
  .muted { color: #555; }
  .small { font-size: 8.5pt; }
  .strong { font-weight: 600; }
  .label { font-size: 7.5pt; letter-spacing: .08em; text-transform: uppercase; color: #666; margin-bottom: 2px !important; }
  .head { display: flex; justify-content: space-between; gap: 24px; padding-bottom: 14px; border-bottom: 2px solid #111; }
  .seller-name { font-size: 15pt; font-weight: 700; margin-bottom: 4px !important; }
  .title-block { text-align: right; flex-shrink: 0; }
  .title { font-size: 17pt; font-weight: 700; letter-spacing: -.01em; }
  .number { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10.5pt; margin-top: 2px !important; }
  .status { display: inline-block; margin-top: 8px !important; padding: 2px 10px; border-radius: 999px; font-size: 8pt; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; }
  .status.paid { background: #e8f5e9; color: #1b5e20; }
  .status.due { background: #fff4e0; color: #8a4b00; }
  .status.void { background: #eee; color: #555; }
  .meta { display: flex; justify-content: space-between; gap: 24px; padding: 16px 0; }
  .dates { margin: 0; display: grid; gap: 4px; text-align: right; font-size: 9pt; }
  .dates div { display: flex; justify-content: flex-end; gap: 12px; }
  .dates dt { color: #666; }
  .dates dd { margin: 0; font-weight: 500; min-width: 90px; }
  .lines { width: 100%; border-collapse: collapse; margin-top: 4px; }
  .lines th { text-align: left; font-size: 7.5pt; letter-spacing: .06em; text-transform: uppercase; color: #666; font-weight: 600; border-bottom: 1px solid #bbb; padding: 6px 6px; }
  .lines td { padding: 8px 6px; border-bottom: 1px solid #e5e5e5; vertical-align: top; }
  .lines .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .totals { display: flex; justify-content: flex-end; margin-top: 10px; }
  .totals dl { margin: 0; width: 260px; }
  .totals dl div { display: flex; justify-content: space-between; gap: 16px; padding: 3px 6px; font-variant-numeric: tabular-nums; }
  .totals dt { color: #444; }
  .totals dd { margin: 0; }
  .totals .grand { border-top: 1px solid #111; margin-top: 4px; padding-top: 6px; font-weight: 700; font-size: 11pt; }
  .totals .due { color: #8a4b00; }
  .payments { margin-top: 18px; padding: 10px 12px; background: #f6f6f6; border-radius: 6px; }
  .foot { margin-top: 22px; padding-top: 10px; border-top: 1px solid #e5e5e5; display: grid; gap: 2px; }
  @media (max-width: 640px) {
    .sheet { padding: 0; }
    .invoice { padding: 20px 16px; box-shadow: none; }
    .head, .meta { flex-direction: column; }
    .title-block, .dates { text-align: left; }
    .dates div { justify-content: flex-start; }
    .totals dl { width: 100%; }
  }
  @media print {
    .no-print { display: none !important; }
    body { background: #fff !important; }
    .sheet { display: block; padding: 0; }
    .invoice { max-width: none; padding: 0; box-shadow: none; }
  }
`
