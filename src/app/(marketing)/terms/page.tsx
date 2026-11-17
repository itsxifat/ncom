import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalPage } from '@/components/marketing/site/LegalPage'
import { LegalContact } from '@/components/marketing/site/LegalContact'
import { getSiteContact } from '@/server/services/siteContactService'

export const metadata: Metadata = {
  title: 'Terms of service',
  description:
    'The terms for using NCOM to build landing pages and online stores.',
  alternates: { canonical: '/terms' },
}

export default async function TermsPage() {
  const contact = await getSiteContact()
  const us = contact.businessName

  return (
    <LegalPage
      title="Terms of service"
      updated="18 November 2026"
      intro={
        <p>
          NCOM is a service of {us} (“we”, “us”) for building landing pages and
          online stores that take orders. These terms apply to everyone who
          creates an NCOM account (“you”). By creating an account or using NCOM,
          you agree to them.
        </p>
      }
      sections={[
        {
          heading: 'Your account',
          body: (
            <>
              <p>
                You need an account to use NCOM. Keep your sign-in details safe
                — you are responsible for what happens in your account and in
                the workspaces you own, including actions by people you invite.
              </p>
              <p>
                You must be at least 18, or the age of majority where you live,
                and give us accurate details. One person may not use trials or
                accounts to get around these terms.
              </p>
            </>
          ),
        },
        {
          heading: 'Packages, trials and billing',
          body: (
            <>
              <p>
                NCOM is sold as packages with the limits and features shown on
                our <Link href="/pricing">pricing page</Link>. Prices are in
                taka; VAT is applied as shown on your invoice.
              </p>
              <ul>
                <li>
                  <strong>Free trial.</strong> Some packages start with a free
                  trial. A workspace can have one trial. No payment is taken
                  during it.
                </li>
                <li>
                  <strong>Billing periods.</strong> After a trial, and at the
                  end of every paid month or year, the bill for the next period
                  is due. We raise it a few days before and tell the workspace
                  owner by email.
                </li>
                <li>
                  <strong>Unpaid bills.</strong> If a bill is still unpaid one
                  day after it is due, the workspace is paused: its sites show
                  “temporarily unavailable”, the dashboard opens only on
                  Billing, and API keys stop working. Nothing is deleted. Paying
                  the bill restores everything immediately.
                </li>
                <li>
                  <strong>Payments</strong> are made through Enfinito Pay
                  (bKash, Nagad, Rocket or card). We do not see or store your
                  card or wallet details.
                </li>
                <li>
                  <strong>Changes and cancellation.</strong> You can change or
                  cancel your package at any time from Plan &amp; billing. A
                  cancelled package runs to the end of the period you paid for.
                  Refunds are covered by our{' '}
                  <Link href="/refund-policy">refund policy</Link>.
                </li>
                <li>
                  <strong>Price changes.</strong> If we change a package’s
                  price, your current price stays until your next period at the
                  earliest, and we tell you before it changes.
                </li>
              </ul>
            </>
          ),
        },
        {
          heading: 'Your sites, products and buyers',
          body: (
            <>
              <p>
                You own what you put on NCOM — your text, photos, products and
                designs — and you give us the permission we need to host, show
                and back it up in order to run your sites.
              </p>
              <p>
                You are the seller. You are responsible for your products and
                prices, for delivering what you sell, for how you treat your
                buyers and their information, and for any licences, taxes and
                laws that apply to your business. NCOM is not a party to the
                sales made on your sites.
              </p>
              <p>
                The fake-order check, courier booking and delivery statuses come
                from couriers such as Steadfast and Pathao, using your own
                courier accounts. They help you decide; they are not a guarantee
                about any buyer or parcel.
              </p>
            </>
          ),
        },
        {
          heading: 'What you may not do',
          body: (
            <ul>
              <li>
                Sell anything illegal in Bangladesh, counterfeit goods, or
                products you have no right to sell.
              </li>
              <li>
                Mislead or defraud buyers, or collect their information for
                anything but their order.
              </li>
              <li>
                Send spam, host malware, or attack, overload or probe NCOM or
                other sites.
              </li>
              <li>
                Copy, resell or reverse-engineer NCOM, or get around its limits
                or billing.
              </li>
              <li>
                Upload content that is hateful, sexually explicit, or infringes
                someone else’s rights.
              </li>
            </ul>
          ),
        },
        {
          heading: 'AI features',
          body: (
            <p>
              Building with AI uses credits and an AI provider to draft pages
              from your description. Check what it writes before you publish:
              you are responsible for what goes live on your sites.
            </p>
          ),
        },
        {
          heading: 'Availability and changes to NCOM',
          body: (
            <p>
              We work to keep NCOM running and your sites online, but we cannot
              promise it will never be interrupted. We improve NCOM all the time
              and may change or retire features; if a change takes away
              something important you pay for, we will tell you in advance.
            </p>
          ),
        },
        {
          heading: 'Suspension and closing an account',
          body: (
            <p>
              We may suspend or close an account that breaks these terms, puts
              buyers or other sellers at risk, or is used for fraud — with
              notice where we can give it. You can stop using NCOM at any time;
              ask us and we will delete your workspace and its data, apart from
              records we must keep by law, such as invoices.
            </p>
          ),
        },
        {
          heading: 'Liability',
          body: (
            <p>
              NCOM is provided as it is. As far as the law allows, we are not
              liable for lost sales, profits or data, or for anything couriers,
              payment providers or other services do. Our total liability for
              any claim is limited to what you paid us in the three months
              before it arose.
            </p>
          ),
        },
        {
          heading: 'Law and changes to these terms',
          body: (
            <p>
              These terms are governed by the laws of Bangladesh, and the courts
              of Dhaka have jurisdiction. If we change them, we will post the
              new version here and tell account owners about important changes;
              using NCOM after that means you accept them.
            </p>
          ),
        },
        {
          heading: 'Contact',
          body: (
            <p>
              Questions about these terms: <LegalContact contact={contact} />.
            </p>
          ),
        },
      ]}
    />
  )
}
