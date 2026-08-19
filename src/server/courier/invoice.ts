/**
 * Order numbers as couriers will accept them.
 *
 * An order number in this platform is a human-facing label and is built to be
 * read: `OrganizationSettings.orderNumberPrefix` defaults to `#`, so the
 * ordinary number is `#1001`. That is the right thing to print on an invoice
 * and the wrong thing to put on a courier's wire.
 *
 * Steadfast validates the field and says so plainly:
 *
 *   "The invoice may only contain letters, numbers, dashes and underscores."
 *
 * A `#` therefore fails validation on every single order, which is not a
 * degraded state but a total one — with the default prefix in place, no parcel
 * can ever be created. The failure also arrives as an HTTP 200 carrying a
 * status in the 400s, so nothing about it looks like an outage.
 *
 * The conversion lives here, at the boundary, for the same reason the taka/paisa
 * conversion lives in the Steadfast client: it is a property of someone else's
 * wire format, not of our data. The order keeps its readable number and the
 * courier gets one it accepts.
 */

/** Everything Steadfast permits in `invoice`: letters, numbers, `-`, `_`. */
const DISALLOWED = /[^A-Za-z0-9_-]+/g

/**
 * Rewrites an order number into a courier-safe reference.
 *
 * Disallowed runs collapse to a single dash rather than being deleted, so a
 * separator that carried meaning still separates: `ORD/2026#5` reads as
 * `ORD-2026-5` and not as the ambiguous `ORD20265`. Leading and trailing dashes
 * are then trimmed, which is what turns the common `#1001` into a clean `1001`
 * instead of `-1001`.
 *
 * This is deterministic and has no per-call state, which matters more than it
 * appears: the value is sent to the courier AND stored on the shipment row, and
 * inbound webhooks are matched by echoing it back. A reference that differed
 * between the send and the store would orphan every status update the courier
 * sent us.
 */
export function toCourierInvoice(orderNumber: string): string {
  return orderNumber.replace(DISALLOWED, '-').replace(/^-+|-+$/g, '')
}

/**
 * Converts, or throws with a message naming the setting to change.
 *
 * Used at the courier boundary. The throw is reachable only by an order number
 * with no alphanumeric character at all — a prefix of `#` and an empty suffix
 * cannot produce it, but a merchant who sets the prefix to `###` and clears the
 * counter can. Failing here names the cause; letting it through produces a
 * provider validation error that names nothing the merchant controls.
 */
export function requireCourierInvoice(orderNumber: string): string {
  const invoice = toCourierInvoice(orderNumber)
  if (!invoice) {
    throw new Error(
      `Order number "${orderNumber}" has no letters or numbers in it, so couriers cannot reference it — check the order number prefix in settings`
    )
  }
  return invoice
}
