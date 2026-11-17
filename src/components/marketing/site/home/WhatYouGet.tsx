/**
 * Everything a package includes, as a grid of what the seller actually gets.
 *
 * Ported from the NCOM homepage design (Claude Design canvas, Main.dc.html):
 * inline styles and data-hover hooks as designed; keyframes live in site.css.
 */
export function WhatYouGet() {
  return (
    <section
      id="get"
      aria-labelledby="get-title"
      style={{
        maxWidth: '1200px',
        margin: '0 auto',
        padding: 'clamp(72px, 8vw, 116px) clamp(16px, 4vw, 40px)',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          animation: 'ncom-rise 0.9s cubic-bezier(0.16, 1, 0.3, 1) both',
        }}
      >
        <p
          style={{
            margin: '0',
            fontSize: '14px',
            fontWeight: '700',
            color: 'var(--accent)',
          }}
        >
          What you get
        </p>
        <h2
          id="get-title"
          style={{
            textWrap: 'balance',
            margin: '16px 0 0',
            maxWidth: '820px',
            fontFamily:
              'var(--font-space-grotesk), var(--font-manrope), var(--font-bangla), sans-serif',
            fontWeight: '600',
            fontSize: 'clamp(36px, 4.8vw, 64px)',
            lineHeight: '1.02',
            letterSpacing: '-0.032em',
          }}
        >
          What you get with NCOM
        </h2>
        <p
          style={{
            margin: '20px 0 0',
            maxWidth: '640px',
            fontSize: '18px',
            color: '#b4b4bd',
          }}
        >
          Every package includes the order form, offers, courier booking, the
          fake-order check, stickers and tracking. Packages start at ৳199 a
          month, every one with a 7-day free trial, and NCOM takes no cut of
          your sales.
        </p>
      </div>
      <ul
        style={{
          margin: '56px 0 0',
          padding: '0',
          listStyle: 'none',
          display: 'grid',
          gridTemplateColumns:
            'repeat(auto-fill, minmax(min(100%, 268px), 1fr))',
          gap: '1px',
          background: 'rgba(255, 255, 255, 0.09)',
          border: '1px solid rgba(255, 255, 255, 0.09)',
          borderRadius: '24px',
          overflow: 'hidden',
        }}
      >
        <li style={{ background: '#09090b', overflow: 'hidden' }}>
          <div
            style={{
              height: '100%',
              boxSizing: 'border-box',
              padding: '30px 28px 32px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              animation: 'ncom-rise 0.9s cubic-bezier(0.16, 1, 0.3, 1) both',
            }}
          >
            <svg
              viewBox="0 0 24 24"
              width="26"
              height="26"
              fill="none"
              stroke="var(--accent)"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="6" y="2.5" width="12" height="19" rx="2.5"></rect>
              <path d="M9.5 7h5M9.5 11h5M9.5 15h3"></path>
            </svg>
            <h3
              style={{
                textWrap: 'balance',
                margin: '10px 0 0',
                fontFamily:
                  'var(--font-space-grotesk), var(--font-manrope), var(--font-bangla), sans-serif',
                fontWeight: '600',
                fontSize: '20px',
                lineHeight: '1.2',
                letterSpacing: '-0.02em',
                color: '#f5f5f6',
              }}
            >
              A landing page that takes orders
            </h3>
            <p
              style={{
                margin: '0',
                fontSize: '15px',
                lineHeight: '1.55',
                color: '#b4b4bd',
              }}
            >
              One page for one product, a combo or a category, with the order
              form right on it: name, phone, address, done.
            </p>
          </div>
        </li>
        <li style={{ background: '#09090b', overflow: 'hidden' }}>
          <div
            style={{
              height: '100%',
              boxSizing: 'border-box',
              padding: '30px 28px 32px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              animation: 'ncom-rise 0.9s cubic-bezier(0.16, 1, 0.3, 1) both',
            }}
          >
            <svg
              viewBox="0 0 24 24"
              width="26"
              height="26"
              fill="none"
              stroke="var(--accent)"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M4 9h16l-1.6-5H5.6z"></path>
              <path d="M5 9v11h14V9"></path>
              <path d="M10 20v-6h4v6"></path>
            </svg>
            <h3
              style={{
                textWrap: 'balance',
                margin: '10px 0 0',
                fontFamily:
                  'var(--font-space-grotesk), var(--font-manrope), var(--font-bangla), sans-serif',
                fontWeight: '600',
                fontSize: '20px',
                lineHeight: '1.2',
                letterSpacing: '-0.02em',
                color: '#f5f5f6',
              }}
            >
              A full online store
            </h3>
            <p
              style={{
                margin: '0',
                fontSize: '15px',
                lineHeight: '1.55',
                color: '#b4b4bd',
              }}
            >
              Home page, categories and a page for every product, with cart,
              checkout and customer accounts.
            </p>
          </div>
        </li>
        <li style={{ background: '#09090b', overflow: 'hidden' }}>
          <div
            style={{
              height: '100%',
              boxSizing: 'border-box',
              padding: '30px 28px 32px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              animation: 'ncom-rise 0.9s cubic-bezier(0.16, 1, 0.3, 1) both',
            }}
          >
            <svg
              viewBox="0 0 24 24"
              width="26"
              height="26"
              fill="none"
              stroke="var(--accent)"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M3 12V3.5h8.5L21 13l-8.5 8.5z"></path>
              <circle cx="7.5" cy="8" r="1.5"></circle>
            </svg>
            <h3
              style={{
                textWrap: 'balance',
                margin: '10px 0 0',
                fontFamily:
                  'var(--font-space-grotesk), var(--font-manrope), var(--font-bangla), sans-serif',
                fontWeight: '600',
                fontSize: '20px',
                lineHeight: '1.2',
                letterSpacing: '-0.02em',
                color: '#f5f5f6',
              }}
            >
              Offers and delivery charges
            </h3>
            <p
              style={{
                margin: '0',
                fontSize: '15px',
                lineHeight: '1.55',
                color: '#b4b4bd',
              }}
            >
              Combos, mix &amp; match, free gifts and discount codes. Delivery
              charges come pre-filled.
            </p>
          </div>
        </li>
        <li style={{ background: '#09090b', overflow: 'hidden' }}>
          <div
            style={{
              height: '100%',
              boxSizing: 'border-box',
              padding: '30px 28px 32px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              animation: 'ncom-rise 0.9s cubic-bezier(0.16, 1, 0.3, 1) both',
            }}
          >
            <svg
              viewBox="0 0 24 24"
              width="26"
              height="26"
              fill="none"
              stroke="var(--accent)"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="3" y="3" width="8" height="8" rx="1.5"></rect>
              <rect x="13" y="3" width="8" height="8" rx="1.5"></rect>
              <rect x="3" y="13" width="8" height="8" rx="1.5"></rect>
              <rect x="13" y="13" width="8" height="8" rx="1.5"></rect>
            </svg>
            <h3
              style={{
                textWrap: 'balance',
                margin: '10px 0 0',
                fontFamily:
                  'var(--font-space-grotesk), var(--font-manrope), var(--font-bangla), sans-serif',
                fontWeight: '600',
                fontSize: '20px',
                lineHeight: '1.2',
                letterSpacing: '-0.02em',
                color: '#f5f5f6',
              }}
            >
              8 ready-made designs
            </h3>
            <p
              style={{
                margin: '0',
                fontSize: '15px',
                lineHeight: '1.55',
                color: '#b4b4bd',
              }}
            >
              Four for landing pages, four for stores, plus two blanks. Each in
              English and Bangla, on every package.
            </p>
          </div>
        </li>
        <li style={{ background: '#09090b', overflow: 'hidden' }}>
          <div
            style={{
              height: '100%',
              boxSizing: 'border-box',
              padding: '30px 28px 32px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              animation: 'ncom-rise 0.9s cubic-bezier(0.16, 1, 0.3, 1) both',
            }}
          >
            <svg
              viewBox="0 0 24 24"
              width="26"
              height="26"
              fill="none"
              stroke="var(--accent)"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M9 6h12M9 12h12M9 18h12"></path>
              <path d="M4 6h.01M4 12h.01M4 18h.01" strokeWidth="2.6"></path>
            </svg>
            <h3
              style={{
                textWrap: 'balance',
                margin: '10px 0 0',
                fontFamily:
                  'var(--font-space-grotesk), var(--font-manrope), var(--font-bangla), sans-serif',
                fontWeight: '600',
                fontSize: '20px',
                lineHeight: '1.2',
                letterSpacing: '-0.02em',
                color: '#f5f5f6',
              }}
            >
              One order list
            </h3>
            <p
              style={{
                margin: '0',
                fontSize: '15px',
                lineHeight: '1.55',
                color: '#b4b4bd',
              }}
            >
              Every order from every site in one list, showing the page and
              offer that sold it.
            </p>
          </div>
        </li>
        <li style={{ background: '#09090b', overflow: 'hidden' }}>
          <div
            style={{
              height: '100%',
              boxSizing: 'border-box',
              padding: '30px 28px 32px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              animation: 'ncom-rise 0.9s cubic-bezier(0.16, 1, 0.3, 1) both',
            }}
          >
            <svg
              viewBox="0 0 24 24"
              width="26"
              height="26"
              fill="none"
              stroke="var(--accent)"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.1 7.5 9.5 4.3-1.4 7.5-4.9 7.5-9.5V6z"></path>
              <path d="m8.8 12 2.3 2.3 4.2-4.6"></path>
            </svg>
            <h3
              style={{
                textWrap: 'balance',
                margin: '10px 0 0',
                fontFamily:
                  'var(--font-space-grotesk), var(--font-manrope), var(--font-bangla), sans-serif',
                fontWeight: '600',
                fontSize: '20px',
                lineHeight: '1.2',
                letterSpacing: '-0.02em',
                color: '#f5f5f6',
              }}
            >
              The fake-order check
            </h3>
            <p
              style={{
                margin: '0',
                fontSize: '15px',
                lineHeight: '1.55',
                color: '#b4b4bd',
              }}
            >
              Each buyer’s Steadfast delivery record is checked against your
              rules. Risky orders wait for you.
            </p>
          </div>
        </li>
        <li style={{ background: '#09090b', overflow: 'hidden' }}>
          <div
            style={{
              height: '100%',
              boxSizing: 'border-box',
              padding: '30px 28px 32px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              animation: 'ncom-rise 0.9s cubic-bezier(0.16, 1, 0.3, 1) both',
            }}
          >
            <svg
              viewBox="0 0 24 24"
              width="26"
              height="26"
              fill="none"
              stroke="var(--accent)"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M2.5 6.5h11v9h-11zM13.5 9.5h4l3 3v3h-7"></path>
              <circle cx="6.5" cy="17.5" r="2"></circle>
              <circle cx="17" cy="17.5" r="2"></circle>
            </svg>
            <h3
              style={{
                textWrap: 'balance',
                margin: '10px 0 0',
                fontFamily:
                  'var(--font-space-grotesk), var(--font-manrope), var(--font-bangla), sans-serif',
                fontWeight: '600',
                fontSize: '20px',
                lineHeight: '1.2',
                letterSpacing: '-0.02em',
                color: '#f5f5f6',
              }}
            >
              Courier booking
            </h3>
            <p
              style={{
                margin: '0',
                fontSize: '15px',
                lineHeight: '1.55',
                color: '#b4b4bd',
              }}
            >
              Book Steadfast or Pathao from the order, on your own accounts, so
              the cash settles to you.
            </p>
          </div>
        </li>
        <li style={{ background: '#09090b', overflow: 'hidden' }}>
          <div
            style={{
              height: '100%',
              boxSizing: 'border-box',
              padding: '30px 28px 32px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              animation: 'ncom-rise 0.9s cubic-bezier(0.16, 1, 0.3, 1) both',
            }}
          >
            <svg
              viewBox="0 0 24 24"
              width="26"
              height="26"
              fill="none"
              stroke="var(--accent)"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M4 5v14M7.5 5v14M11 5v14M14.5 5v14M18 5v14M20.5 5v14"></path>
            </svg>
            <h3
              style={{
                textWrap: 'balance',
                margin: '10px 0 0',
                fontFamily:
                  'var(--font-space-grotesk), var(--font-manrope), var(--font-bangla), sans-serif',
                fontWeight: '600',
                fontSize: '20px',
                lineHeight: '1.2',
                letterSpacing: '-0.02em',
                color: '#f5f5f6',
              }}
            >
              Stickers, scanning and tracking
            </h3>
            <p
              style={{
                margin: '0',
                fontSize: '15px',
                lineHeight: '1.55',
                color: '#b4b4bd',
              }}
            >
              4×6 stickers with barcodes, scanning with a phone camera, and a
              tracking link for every buyer.
            </p>
          </div>
        </li>
        <li style={{ background: '#09090b', overflow: 'hidden' }}>
          <div
            style={{
              height: '100%',
              boxSizing: 'border-box',
              padding: '30px 28px 32px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              animation: 'ncom-rise 0.9s cubic-bezier(0.16, 1, 0.3, 1) both',
            }}
          >
            <svg
              viewBox="0 0 24 24"
              width="26"
              height="26"
              fill="none"
              stroke="var(--accent)"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M3 5.5h10M8 3.5v2M5.2 5.5c1 3.8 3.7 6.6 7.3 7.6M10.8 5.5c-1 3.8-3.7 6.6-7.3 7.6"></path>
              <path d="m13 20.5 4-9 4 9M14.4 17.5h5.2"></path>
            </svg>
            <h3
              style={{
                textWrap: 'balance',
                margin: '10px 0 0',
                fontFamily:
                  'var(--font-space-grotesk), var(--font-manrope), var(--font-bangla), sans-serif',
                fontWeight: '600',
                fontSize: '20px',
                lineHeight: '1.2',
                letterSpacing: '-0.02em',
                color: '#f5f5f6',
              }}
            >
              Bangla or English
            </h3>
            <p
              style={{
                margin: '0',
                fontSize: '15px',
                lineHeight: '1.55',
                color: '#b4b4bd',
              }}
            >
              On a Bangla site every word NCOM writes is Bangla, even the
              prices: <span lang="bn">৳১,২৫০</span>.
            </p>
          </div>
        </li>
        <li style={{ background: '#09090b', overflow: 'hidden' }}>
          <div
            style={{
              height: '100%',
              boxSizing: 'border-box',
              padding: '30px 28px 32px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              animation: 'ncom-rise 0.9s cubic-bezier(0.16, 1, 0.3, 1) both',
            }}
          >
            <svg
              viewBox="0 0 24 24"
              width="26"
              height="26"
              fill="none"
              stroke="var(--accent)"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 3.5l1.7 4.4 4.4 1.7-4.4 1.7L12 15.7l-1.7-4.4-4.4-1.7 4.4-1.7z"></path>
              <path d="M18.5 14.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"></path>
            </svg>
            <h3
              style={{
                textWrap: 'balance',
                margin: '10px 0 0',
                fontFamily:
                  'var(--font-space-grotesk), var(--font-manrope), var(--font-bangla), sans-serif',
                fontWeight: '600',
                fontSize: '20px',
                lineHeight: '1.2',
                letterSpacing: '-0.02em',
                color: '#f5f5f6',
              }}
            >
              AI, three ways
            </h3>
            <p
              style={{
                margin: '0',
                fontSize: '15px',
                lineHeight: '1.55',
                color: '#b4b4bd',
              }}
            >
              Describe your business and get a page you can edit (uses AI
              credits), or paste NCOM’s prompt into ChatGPT, Gemini or Claude
              for free.
            </p>
          </div>
        </li>
        <li style={{ background: '#09090b', overflow: 'hidden' }}>
          <div
            style={{
              height: '100%',
              boxSizing: 'border-box',
              padding: '30px 28px 32px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              animation: 'ncom-rise 0.9s cubic-bezier(0.16, 1, 0.3, 1) both',
            }}
          >
            <svg
              viewBox="0 0 24 24"
              width="26"
              height="26"
              fill="none"
              stroke="var(--accent)"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="9"></circle>
              <path d="M3 12h18M12 3c3.2 3.4 3.2 14.6 0 18M12 3c-3.2 3.4-3.2 14.6 0 18"></path>
            </svg>
            <h3
              style={{
                textWrap: 'balance',
                margin: '10px 0 0',
                fontFamily:
                  'var(--font-space-grotesk), var(--font-manrope), var(--font-bangla), sans-serif',
                fontWeight: '600',
                fontSize: '20px',
                lineHeight: '1.2',
                letterSpacing: '-0.02em',
                color: '#f5f5f6',
              }}
            >
              Your own web address
            </h3>
            <p
              style={{
                margin: '0',
                fontSize: '15px',
                lineHeight: '1.55',
                color: '#b4b4bd',
              }}
            >
              An NCOM address with SSL on every package. Connect your own domain
              from Starter.
            </p>
          </div>
        </li>
        <li style={{ background: '#09090b', overflow: 'hidden' }}>
          <div
            style={{
              height: '100%',
              boxSizing: 'border-box',
              padding: '30px 28px 32px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              animation: 'ncom-rise 0.9s cubic-bezier(0.16, 1, 0.3, 1) both',
            }}
          >
            <svg
              viewBox="0 0 24 24"
              width="26"
              height="26"
              fill="none"
              stroke="var(--accent)"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M4 20V11M10 20V5M16 20v-6M2.5 20.5h19"></path>
            </svg>
            <h3
              style={{
                textWrap: 'balance',
                margin: '10px 0 0',
                fontFamily:
                  'var(--font-space-grotesk), var(--font-manrope), var(--font-bangla), sans-serif',
                fontWeight: '600',
                fontSize: '20px',
                lineHeight: '1.2',
                letterSpacing: '-0.02em',
                color: '#f5f5f6',
              }}
            >
              Ad tracking and a sales report
            </h3>
            <p
              style={{
                margin: '0',
                fontSize: '15px',
                lineHeight: '1.55',
                color: '#b4b4bd',
              }}
            >
              Meta Pixel and Conversions API, GA4 and invoiced vs collected on
              every package; Tag Manager from Starter.
            </p>
          </div>
        </li>
      </ul>
    </section>
  )
}
