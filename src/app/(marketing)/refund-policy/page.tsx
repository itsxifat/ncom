import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalPage } from '@/components/marketing/site/LegalPage'
import { LegalContact } from '@/components/marketing/site/LegalContact'
import { getSiteContact } from '@/server/services/siteContactService'

export const metadata: Metadata = {
  title: 'Refund policy',
  description: 'When NCOM payments are refunded, and how to ask for a refund.',
  alternates: { canonical: '/refund-policy' },
}

export default async function RefundPolicyPage() {
  const contact = await getSiteContact()

  return (
    <LegalPage
      title="Refund policy"
      updated="18 November 2026"
      intro={
        <p>
          Most NCOM packages start with a free trial, so you can build and take
          real orders before you pay anything. This page explains what happens
          with payments after that.
        </p>
      }
      sections={[
        {
          heading: 'The free trial',
          body: (
            <p>
              Nothing is charged during a trial. If NCOM is not right for you,
              simply don’t pay the first bill — your workspace pauses at the end
              of the trial and nothing is taken.
            </p>
          ),
        },
        {
          heading: 'Package payments',
          body: (
            <>
              <p>
                A payment buys a billing period — a month or a year — that
                starts straight away, so payments are not refunded for time you
                no longer want. Cancelling stops the next bill; your package
                keeps running until the end of the period you paid for.
              </p>
              <p>
                We do not give partial refunds for unused days, unused limits or
                a move to a smaller package.
              </p>
            </>
          ),
        },
        {
          heading: 'When we do refund',
          body: (
            <ul>
              <li>You were charged twice for the same bill.</li>
              <li>You were charged an amount different from your invoice.</li>
              <li>
                You paid, but we could not switch your package on, and we could
                not fix it.
              </li>
              <li>
                A serious fault on our side kept your sites unavailable for a
                long part of the period you paid for.
              </li>
            </ul>
          ),
        },
        {
          heading: 'AI credits',
          body: (
            <p>
              AI credits are added to your workspace as soon as they are paid
              for, so they are not refundable once added — unless the payment
              was a duplicate or a mistake as described above.
            </p>
          ),
        },
        {
          heading: 'How to ask',
          body: (
            <p>
              Contact us at <LegalContact contact={contact} /> with your invoice
              number and what went wrong. Approved refunds go back to the bKash,
              Nagad, Rocket account or card you paid with, through Enfinito Pay;
              how long that takes depends on your bank or wallet. You can find
              every invoice under{' '}
              <Link href="/billing">Plan &amp; billing</Link>.
            </p>
          ),
        },
      ]}
    />
  )
}
