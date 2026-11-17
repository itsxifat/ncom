import type { Metadata } from 'next'
import { LegalPage } from '@/components/marketing/site/LegalPage'
import { LegalContact } from '@/components/marketing/site/LegalContact'
import { getSiteContact } from '@/server/services/siteContactService'

export const metadata: Metadata = {
  title: 'Privacy policy',
  description:
    'What NCOM collects, why, who it is shared with, and your choices.',
  alternates: { canonical: '/privacy' },
}

export default async function PrivacyPage() {
  const contact = await getSiteContact()
  const us = contact.businessName

  return (
    <LegalPage
      title="Privacy policy"
      updated="18 November 2026"
      intro={
        <p>
          This policy explains what information {us} collects through NCOM, why,
          and what you can do about it. It covers sellers who use NCOM and the
          buyers who order from sellers’ sites.
        </p>
      }
      sections={[
        {
          heading: 'Information about sellers',
          body: (
            <ul>
              <li>
                <strong>Account:</strong> your name, email address and password
                (stored only as a secure hash), or your Google account if you
                sign in with Google.
              </li>
              <li>
                <strong>Your workspace:</strong> the sites, pages, products,
                offers, orders and settings you create, and the people you
                invite.
              </li>
              <li>
                <strong>Billing:</strong> your package, invoices and payment
                records. Payments are taken by Enfinito Pay; we never see your
                card or wallet details.
              </li>
              <li>
                <strong>Connections you add:</strong> courier, Meta and Google
                credentials, stored encrypted and used only for what you
                connected them for.
              </li>
              <li>
                <strong>Usage:</strong> sign-ins, actions in the dashboard and
                technical logs, to keep NCOM secure and working.
              </li>
            </ul>
          ),
        },
        {
          heading: 'Information about buyers',
          body: (
            <>
              <p>
                When someone orders from a site built on NCOM, the name, phone
                number, address and order details they enter are stored for the
                seller. The seller decides how that information is used and is
                responsible to the buyer for it; NCOM processes it on the
                seller’s behalf.
              </p>
              <p>
                To run their business, a seller can have NCOM share an order
                with their courier (such as Steadfast or Pathao) to book
                delivery, check a buyer’s phone number against the courier’s
                delivery record, and send order events to the seller’s own Meta
                or Google accounts if they have connected them.
              </p>
            </>
          ),
        },
        {
          heading: 'Visitors to sites',
          body: (
            <p>
              We count page views and visitors for each site so sellers can see
              their traffic and so package limits work. Visitors are counted
              with a one-way hash of their IP address and browser, not stored as
              names. Store sites use cookies for the cart, sign-in and ad
              attribution.
            </p>
          ),
        },
        {
          heading: 'Why we use it',
          body: (
            <ul>
              <li>
                To run NCOM: host your sites, take and route orders, and provide
                the features you use.
              </li>
              <li>
                To bill you, send invoices, and send the emails a billing period
                needs (bills, reminders, notices).
              </li>
              <li>
                To keep NCOM safe: prevent fraud and abuse, and fix problems.
              </li>
              <li>To improve NCOM, from how it is used overall.</li>
            </ul>
          ),
        },
        {
          heading: 'Who we share it with',
          body: (
            <>
              <p>
                We do not sell personal information. We share it only with
                services that help run NCOM, for that purpose:
              </p>
              <ul>
                <li>
                  Hosting and security, including Cloudflare, which protects and
                  delivers our sites.
                </li>
                <li>
                  Enfinito Pay, for payments, and our accounting system, for
                  invoices.
                </li>
                <li>
                  Couriers, and Meta or Google, when a seller connects them.
                </li>
                <li>
                  Our AI provider, when you build with AI — your description is
                  sent to generate the design.
                </li>
                <li>Email delivery, for account and billing emails.</li>
              </ul>
              <p>We may also share information when the law requires it.</p>
            </>
          ),
        },
        {
          heading: 'How long we keep it',
          body: (
            <p>
              We keep your information while your account is open. If you ask us
              to close it, we delete your workspace and its data, except
              invoices and records we must keep by law.
            </p>
          ),
        },
        {
          heading: 'Your choices',
          body: (
            <p>
              You can see and change most of your information in the dashboard.
              You can ask us for a copy, a correction, or deletion. Buyers who
              want to see or remove their order information should contact the
              seller they ordered from; we will help sellers respond.
            </p>
          ),
        },
        {
          heading: 'Security',
          body: (
            <p>
              Connections to NCOM are encrypted, passwords are hashed, and
              stored credentials are encrypted. No system is perfectly secure,
              so please use a strong password and tell us if you think your
              account has been misused.
            </p>
          ),
        },
        {
          heading: 'Changes and contact',
          body: (
            <p>
              We will post changes to this policy here and tell account owners
              about important ones. Questions or requests:{' '}
              <LegalContact contact={contact} />.
            </p>
          ),
        },
      ]}
    />
  )
}
