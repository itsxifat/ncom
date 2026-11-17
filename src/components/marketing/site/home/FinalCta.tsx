import Link from 'next/link'

/**
 * The closing call to start the trial.
 *
 * Ported from the NCOM homepage design (Claude Design canvas, Main.dc.html):
 * inline styles and data-hover hooks as designed; keyframes live in site.css.
 */
export function FinalCta() {
  return (
    <section
      id="get-started"
      aria-labelledby="cta-title"
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: 'var(--accent)',
        color: '#0b0b0c',
      }}
    >
      <div
        style={{
          maxWidth: '1200px',
          margin: '0 auto',
          padding:
            'clamp(96px, 12vw, 160px) clamp(16px, 4vw, 40px) clamp(56px, 7vw, 88px)',
          boxSizing: 'border-box',
          textAlign: 'center',
        }}
      >
        <h2
          id="cta-title"
          style={{
            textWrap: 'balance',
            margin: '0 auto',
            maxWidth: '980px',
            fontFamily:
              'var(--font-space-grotesk), var(--font-manrope), var(--font-bangla), sans-serif',
            fontWeight: '600',
            fontSize: 'clamp(44px, 7.6vw, 112px)',
            lineHeight: '0.94',
            letterSpacing: '-0.04em',
            animation: 'ncom-reveal linear both',
            animationTimeline: 'view()',
            animationRange: 'entry 0% cover 30%',
          }}
        >
          Make your first page in minutes. Try it free for 7 days.
        </h2>
        <p
          style={{ margin: '24px auto 0', fontSize: '19px', fontWeight: '600' }}
        >
          No payment needed to start. Packages from ৳199 a month.
        </p>
        <div
          style={{
            marginTop: '44px',
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: '12px',
          }}
        >
          <Link
            href="/register"
            data-hover="lift"
            style={{
              background: '#0b0b0c',
              color: 'var(--accent)',
              textDecoration: 'none',
              fontWeight: '800',
              fontSize: '17px',
              padding: '0 30px',
              minHeight: '58px',
              borderRadius: '12px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '10px',
            }}
          >
            Start your free trial{' '}
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.25"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M5 12h14M13 6l6 6-6 6"></path>
            </svg>
          </Link>
        </div>
      </div>
      <div
        aria-hidden="true"
        style={{
          borderTop: '2px solid #0b0b0c',
          padding: '18px 0',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            width: 'max-content',
            gap: '40px',
            paddingRight: '40px',
            animation: 'ncom-marquee 30s linear infinite',
            fontFamily:
              'var(--font-space-grotesk), var(--font-manrope), var(--font-bangla), sans-serif',
            fontSize: '22px',
            fontWeight: '600',
            whiteSpace: 'nowrap',
            letterSpacing: '-0.01em',
          }}
        >
          <span>7-day free trial</span>
          <span>·</span>
          <span>Bangla &amp; English</span>
          <span>·</span>
          <span>Cash on delivery</span>
          <span>·</span>
          <span>Steadfast &amp; Pathao</span>
          <span>·</span>
          <span>No cut of your sales</span>
          <span>·</span>
          <span>Fake-order check</span>
          <span>·</span>
          <span>7-day free trial</span>
          <span>·</span>
          <span>Bangla &amp; English</span>
          <span>·</span>
          <span>Cash on delivery</span>
          <span>·</span>
          <span>Steadfast &amp; Pathao</span>
          <span>·</span>
          <span>No cut of your sales</span>
          <span>·</span>
          <span>Fake-order check</span>
          <span>·</span>
        </div>
      </div>
    </section>
  )
}
