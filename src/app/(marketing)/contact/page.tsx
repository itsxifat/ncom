import type { Metadata } from 'next'
import Link from 'next/link'
import {
  CONTAINER,
  HEADING_FONT,
  SectionIntro,
} from '@/components/marketing/site/ui'
import {
  displayPhone,
  getSiteContact,
  whatsappLink,
} from '@/server/services/siteContactService'

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Talk to the NCOM team — WhatsApp, email or Facebook.',
  alternates: { canonical: '/contact' },
}

const CARD = {
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  background: '#111114',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  borderRadius: '24px',
  padding: '28px',
  color: '#f5f5f6',
  textDecoration: 'none',
  minHeight: '180px',
  boxSizing: 'border-box',
} as const

function Channel({
  href,
  label,
  value,
  note,
  icon,
}: {
  href: string | null
  label: string
  value: string
  note: string
  icon: React.ReactNode
}) {
  const body = (
    <>
      <span style={{ color: 'var(--accent)', display: 'inline-flex' }}>
        {icon}
      </span>
      <span style={{ fontSize: '14px', fontWeight: 700, color: '#a1a1aa' }}>
        {label}
      </span>
      <span
        style={{
          fontFamily: HEADING_FONT,
          fontSize: '22px',
          fontWeight: 600,
          overflowWrap: 'anywhere',
        }}
      >
        {value}
      </span>
      <span style={{ marginTop: 'auto', fontSize: '14px', color: '#a1a1aa' }}>
        {note}
      </span>
    </>
  )
  return href ? (
    <a
      href={href}
      data-hover="lift"
      style={CARD}
      target={href.startsWith('http') ? '_blank' : undefined}
      rel="noreferrer"
    >
      {body}
    </a>
  ) : (
    <div style={CARD}>{body}</div>
  )
}

const ICON = {
  width: 26,
  height: 26,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

/** How to reach NCOM — whatever an admin has filled in under Site contact. */
export default async function ContactPage() {
  const contact = await getSiteContact()
  const whatsapp = whatsappLink(contact.whatsapp)
  const channels = [
    whatsapp && (
      <Channel
        key="wa"
        href={whatsapp}
        label="WhatsApp"
        value={displayPhone(contact.whatsapp)}
        note="Fastest for questions about orders, couriers and your sites."
        icon={
          <svg {...ICON}>
            <path d="M4 20l1.3-3.9A8 8 0 1 1 8 19z" />
            <path d="M9 9.5c.3 1.6 1.9 3.7 4.2 4.6l1.1-1.1 2 .9c-.3 1.2-1.3 1.9-2.4 1.6C10.6 14.7 8.4 12 8 9.8 7.8 8.7 8.6 7.7 9.8 7.5l.8 2z" />
          </svg>
        }
      />
    ),
    contact.supportEmail && (
      <Channel
        key="email"
        href={`mailto:${contact.supportEmail}`}
        label="Email"
        value={contact.supportEmail}
        note="For billing, invoices and anything you want in writing."
        icon={
          <svg {...ICON}>
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="M3 7l9 6 9-6" />
          </svg>
        }
      />
    ),
    contact.phone && (
      <Channel
        key="phone"
        href={`tel:${contact.phone.replace(/[^\d+]/g, '')}`}
        label="Phone"
        value={displayPhone(contact.phone)}
        note={contact.hours || 'Call us during working hours.'}
        icon={
          <svg {...ICON}>
            <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />
          </svg>
        }
      />
    ),
    contact.facebookUrl && (
      <Channel
        key="fb"
        href={contact.facebookUrl}
        label="Facebook"
        value="NCOM on Facebook"
        note="News, new features and tips for selling with NCOM."
        icon={
          <svg {...ICON}>
            <path d="M14 8h3V4h-3a4 4 0 0 0-4 4v3H7v4h3v6h4v-6h3l1-4h-4V8a0 0 0 0 1 0 0" />
          </svg>
        }
      />
    ),
  ].filter(Boolean)

  return (
    <section
      style={{
        ...CONTAINER,
        padding:
          'clamp(64px, 8vw, 104px) clamp(16px, 4vw, 40px) clamp(72px, 8vw, 116px)',
      }}
    >
      <SectionIntro
        as="h1"
        eyebrow="Contact"
        title="Talk to the NCOM team."
        lead={
          contact.hours
            ? `Real people who know selling in Bangladesh. ${contact.hours}.`
            : 'Real people who know selling in Bangladesh — about your sites, orders, couriers or billing.'
        }
      />

      {channels.length > 0 ? (
        <div
          style={{
            marginTop: '56px',
            display: 'grid',
            gridTemplateColumns:
              'repeat(auto-fit, minmax(min(100%, 250px), 1fr))',
            gap: '16px',
          }}
        >
          {channels}
        </div>
      ) : (
        <p style={{ marginTop: '48px', textAlign: 'center', color: '#a1a1aa' }}>
          Our support channels are being set up. In the meantime, sign in and
          we’ll see your workspace when you write to us.
        </p>
      )}

      {contact.address && (
        <div
          style={{
            marginTop: '40px',
            textAlign: 'center',
            color: '#a1a1aa',
            fontSize: '15px',
          }}
        >
          <p style={{ margin: 0, fontWeight: 700, color: '#f5f5f6' }}>
            {contact.businessName}
          </p>
          <p style={{ margin: '4px 0 0', whiteSpace: 'pre-line' }}>
            {contact.address}
          </p>
        </div>
      )}

      <p
        style={{
          marginTop: '48px',
          textAlign: 'center',
          fontSize: '15px',
          color: '#a1a1aa',
        }}
      >
        Ready to start?{' '}
        <Link
          href="/register"
          data-hover="link"
          style={{
            color: 'var(--accent)',
            fontWeight: 700,
            textDecoration: 'none',
          }}
        >
          Try NCOM free for 7 days →
        </Link>
      </p>
    </section>
  )
}
