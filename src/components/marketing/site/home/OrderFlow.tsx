import { orderBarcodeSvg } from '@/server/labels/barcode'
import { OrderFlowSteps } from './OrderFlowSteps'

/**
 * What happens after the order: the four things NCOM does between the buyer
 * tapping "confirm" and the cash coming in, each shown as the real screen or
 * the real paper — the delivery-record check, the 4×6 sticker, the buyer's
 * tracking page and the courier's statuses.
 *
 * The sticker's barcode is the one the label printer makes (CODE 128 from
 * server/labels/barcode), rendered here on the server.
 */
export function OrderFlow() {
  const barcode = orderBarcodeSvg('NC-10483')?.svg ?? null

  return (
    <section id="flow" aria-labelledby="flow-title" className="of">
      <div className="of-inner">
        <div
          className="of-head"
          style={{
            animation: 'ncom-rise 0.9s cubic-bezier(0.16, 1, 0.3, 1) both',
          }}
        >
          <p className="of-eyebrow">Orders and delivery</p>
          <h2 id="flow-title">
            How an order moves, from your page to the buyer’s door.
          </h2>
          <p className="of-lead">
            Each order is checked before it ships, booked with Steadfast or
            Pathao, tracked by the buyer, and counted when the cash comes in.
          </p>
        </div>
        <OrderFlowSteps barcode={barcode} />
      </div>
    </section>
  )
}
