import { prisma } from '../src/server/db/client'
import { toCourierInvoice } from '../src/server/courier/invoice'

/**
 * Requeues orders whose courier dispatch failed permanently.
 *
 * Why this exists as a one-off rather than as part of the sweep:
 *
 * A dispatch that the courier *rejects* is recorded as non-retryable, because
 * normally it is — a bad address or a wrong API key fails identically forever,
 * and retrying it on a timer only delays the person who has to fix it. So the
 * shipment gets `nextAttemptAt: null` and the order moves to FAILED.
 *
 * That was the correct handling of an incorrect rejection. Every order carrying
 * the default `#` order-number prefix was rejected by Steadfast with
 * "The invoice may only contain letters, numbers, dashes and underscores", was
 * classified permanent, and stopped. Those orders match neither query in
 * `runDueDispatches` — they are not PROCESSING-without-a-shipment, and their
 * `nextAttemptAt` is null — so fixing the code does not, on its own, move them.
 * They have to be put back in the queue by hand, once.
 *
 * What it does NOT do is call the courier. It resets the rows the sweep reads
 * and lets the ordinary pipeline do the sending, so there is one code path that
 * creates parcels and this script cannot invent a second one.
 *
 *   pnpm tsx scripts/requeue-failed-dispatches.ts          # dry run, prints only
 *   pnpm tsx scripts/requeue-failed-dispatches.ts --apply  # writes
 *
 * Requires the courier sweep to actually be running afterwards, otherwise the
 * requeued rows just sit there:
 *   curl -H "Authorization: Bearer $CRON_SECRET" .../api/cron/courier-sync
 */

const APPLY = process.argv.includes('--apply')

async function main() {
  // Undispatched shipments that the pipeline has given up on: no consignment
  // was ever created, and nothing is scheduled to try again.
  const stuck = await prisma.courierShipment.findMany({
    where: {
      consignmentId: null,
      nextAttemptAt: null,
      status: 'PENDING',
    },
    select: {
      id: true,
      merchantOrderId: true,
      lastError: true,
      attempts: true,
      orderId: true,
      order: { select: { orderNumber: true, workflowState: true } },
    },
    orderBy: { createdAt: 'asc' },
  })

  if (stuck.length === 0) {
    console.log('No stuck dispatches found.')
    return
  }

  // Separated because only the first group is fixed by the invoice change. The
  // rest failed for their own reasons — a bad address, no credentials — and
  // requeueing those just reproduces the same failure on a timer.
  const invoiceRejects = stuck.filter(
    (row) =>
      row.lastError?.toLowerCase().includes('invoice') ||
      row.merchantOrderId !== toCourierInvoice(row.merchantOrderId)
  )
  const others = stuck.filter((row) => !invoiceRejects.includes(row))

  console.log(`Stuck dispatches: ${stuck.length}`)
  console.log(`  fixable by the invoice change: ${invoiceRejects.length}`)
  console.log(`  failed for other reasons:      ${others.length}\n`)

  for (const row of invoiceRejects.slice(0, 20)) {
    console.log(
      `  ${row.order?.orderNumber ?? '?'} -> ${toCourierInvoice(row.merchantOrderId)}  (${row.attempts} attempts) ${row.lastError ?? ''}`
    )
  }
  if (invoiceRejects.length > 20) {
    console.log(`  … and ${invoiceRejects.length - 20} more`)
  }

  if (others.length > 0) {
    console.log('\nNot requeued — inspect these by hand:')
    for (const row of others.slice(0, 10)) {
      console.log(`  ${row.order?.orderNumber ?? '?'}: ${row.lastError ?? ''}`)
    }
  }

  if (!APPLY) {
    console.log('\nDry run. Re-run with --apply to requeue.')
    return
  }

  let requeued = 0
  for (const row of invoiceRejects) {
    await prisma.$transaction([
      prisma.courierShipment.update({
        where: { id: row.id },
        data: {
          // Zeroed so the attempt budget is not already spent — these attempts
          // were made against a reference the courier could never accept, and
          // counting them would exhaust the retry on the first real try.
          attempts: 0,
          lastError: null,
          nextAttemptAt: new Date(),
          merchantOrderId: toCourierInvoice(row.merchantOrderId),
        },
      }),
      // Back to the state that means "approved, waiting for a parcel". The
      // sweep reads this, and so does the merchant's order list.
      prisma.order.update({
        where: { id: row.orderId },
        data: { workflowState: 'PROCESSING', workflowUpdatedAt: new Date() },
      }),
      prisma.orderEvent.create({
        data: {
          orderId: row.orderId,
          type: 'courier_dispatch_requeued',
          message:
            'Requeued for dispatch — the order number is now sent in a form the courier accepts',
        },
      }),
    ])
    requeued += 1
  }

  console.log(
    `\nRequeued ${requeued} order(s). Run the courier sweep to send them.`
  )
}

main()
  .catch((cause) => {
    console.error(cause)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
