import Link from 'next/link'

/**
 * The site header: logo, section links, sign in and the trial button.
 *
 * Ported from the NCOM homepage design (Claude Design canvas, Main.dc.html):
 * inline styles and data-hover hooks as designed; keyframes live in site.css.
 */
export function SiteHeaderBar() {
  return (
    <header
      style={{
        position: 'sticky',
        top: '0',
        zIndex: '50',
        background: '#09090b',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
      }}
    >
      <div
        style={{
          position: 'relative',
          maxWidth: '1200px',
          margin: '0 auto',
          padding: '8px clamp(16px, 4vw, 40px)',
          boxSizing: 'border-box',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          columnGap: '24px',
        }}
      >
        <Link
          href="/"
          aria-label="NCOM home"
          style={{
            color: 'var(--accent)',
            display: 'inline-flex',
            alignItems: 'center',
            minHeight: '44px',
            flex: '0 0 auto',
          }}
        >
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
        </Link>
        <nav
          aria-label="Main"
          style={{
            flex: '1 1 calc((780px - 100%) * 999)',
            minWidth: '0',
            marginRight: 'clamp(0px, calc((100% - 780px) * 999), 210px)',
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '0 4px',
          }}
        >
          <Link
            href="/#flow"
            data-hover="link"
            style={{
              color: '#d4d4d8',
              textDecoration: 'none',
              fontSize: '14px',
              fontWeight: '600',
              whiteSpace: 'nowrap',
              minHeight: '44px',
              padding: '0 10px',
              display: 'inline-flex',
              alignItems: 'center',
              borderRadius: '12px',
            }}
          >
            How it works
          </Link>
          <Link
            href="/#templates"
            data-hover="link"
            style={{
              color: '#d4d4d8',
              textDecoration: 'none',
              fontSize: '14px',
              fontWeight: '600',
              whiteSpace: 'nowrap',
              minHeight: '44px',
              padding: '0 10px',
              display: 'inline-flex',
              alignItems: 'center',
              borderRadius: '12px',
            }}
          >
            Templates
          </Link>
          <Link
            href="/pricing"
            data-hover="link"
            style={{
              color: '#d4d4d8',
              textDecoration: 'none',
              fontSize: '14px',
              fontWeight: '600',
              whiteSpace: 'nowrap',
              minHeight: '44px',
              padding: '0 10px',
              display: 'inline-flex',
              alignItems: 'center',
              borderRadius: '12px',
            }}
          >
            Pricing
          </Link>
          <Link
            href="/docs"
            data-hover="link"
            style={{
              color: '#d4d4d8',
              textDecoration: 'none',
              fontSize: '14px',
              fontWeight: '600',
              whiteSpace: 'nowrap',
              minHeight: '44px',
              padding: '0 10px',
              display: 'inline-flex',
              alignItems: 'center',
              borderRadius: '12px',
            }}
          >
            Docs
          </Link>
        </nav>
        <div
          style={{
            position: 'absolute',
            top: '8px',
            right: 'clamp(16px, 4vw, 40px)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <Link
            href="/login"
            data-hover="link"
            style={{
              color: '#f5f5f6',
              textDecoration: 'none',
              fontWeight: '600',
              fontSize: '14px',
              padding: '0 12px',
              minHeight: '44px',
              display: 'inline-flex',
              alignItems: 'center',
              borderRadius: '12px',
            }}
          >
            Sign in
          </Link>
          <Link
            href="/register"
            data-hover="btn"
            style={{
              background: 'var(--accent)',
              color: '#0b0b0c',
              textDecoration: 'none',
              fontWeight: '700',
              fontSize: '14px',
              padding: '0 18px',
              minHeight: '44px',
              borderRadius: '12px',
              display: 'inline-flex',
              alignItems: 'center',
              whiteSpace: 'nowrap',
            }}
          >
            Start free trial
          </Link>
        </div>
      </div>
      <span className="ncom-progress" aria-hidden="true" />
    </header>
  )
}
