import Link from 'next/link'

import {
  displayPhone,
  whatsappLink,
  type SiteContact,
} from '@/server/services/siteContactService'

const LINK = {
  color: '#c4c4cc',
  textDecoration: 'none',
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: '44px',
} as const

/**
 * The site footer, from the homepage design (Claude Design canvas,
 * Main.dc.html). The contact lines and the business name come from
 * /admin/settings → Site contact; an empty one is left out.
 */
export function SiteFooter({ contact }: { contact: SiteContact }) {
  const whatsapp = whatsappLink(contact.whatsapp)
  return (
    <footer style={{ background: '#09090b' }}>
      <div
        style={{
          maxWidth: '1200px',
          margin: '0 auto',
          padding: '64px clamp(16px, 4vw, 40px) 36px',
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            gap: '40px',
          }}
        >
          <div style={{ flex: '1 1 280px', minWidth: '0', maxWidth: '360px' }}>
            <span style={{ color: 'var(--accent)', display: 'inline-flex' }}>
              <svg
                viewBox="0 0 1180 238"
                width="98"
                height="20"
                fill="none"
                stroke="currentColor"
                strokeWidth="48"
                strokeLinejoin="miter"
                role="img"
                aria-label="NCOM"
              >
                <path d="M24 238V24H187A31 31 0 0 1 218 55V238"></path>
                <path d="M495 24H341A31 31 0 0 0 310 55V183A31 31 0 0 0 341 214H495"></path>
                <rect x="562" y="24" width="195" height="190" rx="31"></rect>
                <path d="M848 238V24H1125A31 31 0 0 1 1156 55V238M1001 238V24"></path>
              </svg>
            </span>
            <p
              style={{ margin: '18px 0 0', fontSize: '15px', color: '#a1a1aa' }}
            >
              Landing pages and online stores that take cash-on-delivery orders,
              for sellers in Bangladesh. NCOM is made by {contact.businessName}.
            </p>
            <div
              style={{
                marginTop: '14px',
                display: 'flex',
                flexDirection: 'column',
                fontSize: '14px',
              }}
            >
              {contact.supportEmail && (
                <a
                  href={`mailto:${contact.supportEmail}`}
                  data-hover="link"
                  style={LINK}
                >
                  {contact.supportEmail}
                </a>
              )}
              {whatsapp && (
                <a href={whatsapp} data-hover="link" style={LINK}>
                  WhatsApp {displayPhone(contact.whatsapp)}
                </a>
              )}
              {contact.phone && !whatsapp && (
                <a
                  href={`tel:${contact.phone.replace(/[^\d+]/g, '')}`}
                  data-hover="link"
                  style={LINK}
                >
                  {displayPhone(contact.phone)}
                </a>
              )}
            </div>
          </div>
          <nav
            aria-label="Footer"
            style={{ display: 'flex', flexWrap: 'wrap', gap: '36px 64px' }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0',
                fontSize: '14px',
              }}
            >
              <p
                style={{
                  margin: '0',
                  fontSize: '13px',
                  fontWeight: '700',
                  color: '#f5f5f6',
                }}
              >
                Product
              </p>
              <Link
                href="/#sell"
                data-hover="link"
                style={{
                  color: '#c4c4cc',
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  minHeight: '44px',
                }}
              >
                Pages &amp; stores
              </Link>
              <Link
                href="/#flow"
                data-hover="link"
                style={{
                  color: '#c4c4cc',
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  minHeight: '44px',
                }}
              >
                Orders &amp; couriers
              </Link>
              <Link
                href="/#ai"
                data-hover="link"
                style={{
                  color: '#c4c4cc',
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  minHeight: '44px',
                }}
              >
                AI builder
              </Link>
              <Link
                href="/#templates"
                data-hover="link"
                style={{
                  color: '#c4c4cc',
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  minHeight: '44px',
                }}
              >
                Templates
              </Link>
              <Link
                href="/pricing"
                data-hover="link"
                style={{
                  color: '#c4c4cc',
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  minHeight: '44px',
                }}
              >
                Pricing
              </Link>
            </div>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0',
                fontSize: '14px',
              }}
            >
              <p
                style={{
                  margin: '0',
                  fontSize: '13px',
                  fontWeight: '700',
                  color: '#f5f5f6',
                }}
              >
                Developers
              </p>
              <Link
                href="/docs"
                data-hover="link"
                style={{
                  color: '#c4c4cc',
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  minHeight: '44px',
                }}
              >
                Docs
              </Link>
              <Link
                href="/docs"
                data-hover="link"
                style={{
                  color: '#c4c4cc',
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  minHeight: '44px',
                }}
              >
                API &amp; webhooks
              </Link>
              <Link
                href="/docs"
                data-hover="link"
                style={{
                  color: '#c4c4cc',
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  minHeight: '44px',
                }}
              >
                Courier setup
              </Link>
              <Link
                href="/docs"
                data-hover="link"
                style={{
                  color: '#c4c4cc',
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  minHeight: '44px',
                }}
              >
                AI code editors
              </Link>
            </div>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0',
                fontSize: '14px',
              }}
            >
              <p
                style={{
                  margin: '0',
                  fontSize: '13px',
                  fontWeight: '700',
                  color: '#f5f5f6',
                }}
              >
                Account
              </p>
              <Link
                href="/login"
                data-hover="link"
                style={{
                  color: '#c4c4cc',
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  minHeight: '44px',
                }}
              >
                Sign in
              </Link>
              <Link
                href="/register"
                data-hover="link"
                style={{
                  color: '#c4c4cc',
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  minHeight: '44px',
                }}
              >
                Start free trial
              </Link>
              <Link href="/contact" data-hover="link" style={LINK}>
                Contact us
              </Link>
            </div>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0',
                fontSize: '14px',
              }}
            >
              <p
                style={{
                  margin: '0',
                  fontSize: '13px',
                  fontWeight: '700',
                  color: '#f5f5f6',
                }}
              >
                Legal
              </p>
              <Link href="/terms" data-hover="link" style={LINK}>
                Terms of service
              </Link>
              <Link href="/privacy" data-hover="link" style={LINK}>
                Privacy policy
              </Link>
              <Link href="/refund-policy" data-hover="link" style={LINK}>
                Refund policy
              </Link>
            </div>
          </nav>
        </div>
        <p
          style={{
            margin: '48px 0 0',
            paddingTop: '24px',
            borderTop: '1px solid rgba(255, 255, 255, 0.07)',
            fontSize: '13px',
            color: '#a1a1aa',
          }}
        >
          © {new Date().getFullYear()} NCOM · Made by {contact.businessName} in
          Bangladesh
        </p>
      </div>
    </footer>
  )
}
