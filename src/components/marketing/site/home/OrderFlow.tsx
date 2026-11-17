/**
 * How an order moves from the page to the buyer's door, animated step by step.
 *
 * Ported from the NCOM homepage design (Claude Design canvas, Main.dc.html):
 * inline styles and data-hover hooks as designed; keyframes live in site.css.
 */
export function OrderFlow() {
  return (
    <section
      id="flow"
      aria-labelledby="flow-title"
      style={{
        position: 'relative',
        borderTop: '1px solid rgba(var(--s-ink), 0.06)',
        background: 'var(--s-bg-alt)',
      }}
    >
      <div
        style={{
          maxWidth: '1200px',
          margin: '0 auto',
          padding: 'clamp(72px, 8vw, 116px) clamp(16px, 4vw, 40px)',
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            textAlign: 'center',
            maxWidth: '760px',
            margin: '0 auto',
            animation: 'ncom-rise 0.9s cubic-bezier(0.16, 1, 0.3, 1) both',
          }}
        >
          <p
            style={{
              margin: '0',
              fontSize: '14px',
              fontWeight: '700',
              color: 'var(--accent-text)',
            }}
          >
            Orders and delivery
          </p>
          <h2
            id="flow-title"
            style={{
              textWrap: 'balance',
              margin: '16px 0 0',
              fontFamily:
                'var(--font-space-grotesk), var(--font-manrope), var(--font-bangla), sans-serif',
              fontWeight: '600',
              fontSize: 'clamp(36px, 4.8vw, 64px)',
              lineHeight: '1.02',
              letterSpacing: '-0.032em',
            }}
          >
            How an order moves, from your page to the buyer’s door.
          </h2>
          <p
            style={{
              margin: '20px auto 0',
              maxWidth: '560px',
              fontSize: '18px',
              color: 'var(--s-muted)',
            }}
          >
            NCOM checks each buyer’s delivery record. You book Steadfast or
            Pathao from the order, or switch on automatic booking, and the buyer
            gets a tracking link.
          </p>
        </div>
        <div
          role="img"
          aria-label="An order moving through four steps: order in, checked, with the courier, cash collected"
          style={{ margin: '64px auto 0', maxWidth: '960px', padding: '0 6px' }}
        >
          <div
            style={{ position: 'relative', height: '52px', margin: '0 26px' }}
          >
            <div
              style={{
                position: 'absolute',
                left: '0',
                right: '0',
                top: '25px',
                height: '2px',
                background: 'rgba(var(--s-ink), 0.1)',
                borderRadius: '999px',
              }}
            ></div>
            <div
              style={{
                position: 'absolute',
                left: '0',
                width: '33.333%',
                top: '25px',
                height: '2px',
                background: 'var(--accent)',
                transformOrigin: 'left',
                animation: 'ncom-fill2 9s cubic-bezier(.65,0,.35,1) infinite',
              }}
            ></div>
            <div
              style={{
                position: 'absolute',
                left: '33.333%',
                width: '33.333%',
                top: '25px',
                height: '2px',
                background: 'var(--accent)',
                transformOrigin: 'left',
                animation: 'ncom-fill3 9s cubic-bezier(.65,0,.35,1) infinite',
              }}
            ></div>
            <div
              style={{
                position: 'absolute',
                left: '66.666%',
                width: '33.334%',
                top: '25px',
                height: '2px',
                background: 'var(--accent)',
                transformOrigin: 'left',
                animation: 'ncom-fill4 9s cubic-bezier(.65,0,.35,1) infinite',
              }}
            ></div>
            <span
              style={{
                position: 'absolute',
                left: '0',
                top: '6px',
                width: '40px',
                height: '40px',
                marginLeft: '-20px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--accent)',
                color: '#0b0b0c',
                border: '1px solid var(--accent)',
                boxSizing: 'border-box',
              }}
            >
              <svg
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M6 7h15l-1.5 8.5a2 2 0 0 1-2 1.5H9a2 2 0 0 1-2-1.6L5 4H3"></path>
              </svg>
            </span>
            <span
              style={{
                position: 'absolute',
                left: '33.333%',
                top: '6px',
                width: '40px',
                height: '40px',
                marginLeft: '-20px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--accent)',
                color: '#0b0b0c',
                border: '1px solid var(--accent)',
                boxSizing: 'border-box',
                animation: 'ncom-node2 9s infinite',
              }}
            >
              <svg
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 3 4 6v6c0 4.5 3.4 7.6 8 9 4.6-1.4 8-4.5 8-9V6z"></path>
                <path d="m9 12 2 2 4-4"></path>
              </svg>
            </span>
            <span
              style={{
                position: 'absolute',
                left: '66.666%',
                top: '6px',
                width: '40px',
                height: '40px',
                marginLeft: '-20px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--accent)',
                color: '#0b0b0c',
                border: '1px solid var(--accent)',
                boxSizing: 'border-box',
                animation: 'ncom-node3 9s infinite',
              }}
            >
              <svg
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 6h11v10H3z"></path>
                <path d="M14 9h4l3 3v4h-7"></path>
                <circle cx="7" cy="17" r="1.8"></circle>
                <circle cx="17" cy="17" r="1.8"></circle>
              </svg>
            </span>
            <span
              style={{
                position: 'absolute',
                left: '100%',
                top: '6px',
                width: '40px',
                height: '40px',
                marginLeft: '-20px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--accent)',
                color: '#0b0b0c',
                border: '1px solid var(--accent)',
                boxSizing: 'border-box',
                animation: 'ncom-node4 9s infinite',
              }}
            >
              <svg
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="6" width="18" height="12" rx="2"></rect>
                <circle cx="12" cy="12" r="2.5"></circle>
              </svg>
            </span>
            <span
              style={{
                position: 'absolute',
                left: '100%',
                top: '18px',
                width: '16px',
                height: '16px',
                marginLeft: '-8px',
                borderRadius: '50%',
                background: 'var(--s-text)',
                boxShadow: '0 0 0 3px var(--accent)',
                animation: 'ncom-parcel 9s cubic-bezier(.65,0,.35,1) infinite',
              }}
            ></span>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
              marginTop: '16px',
              textAlign: 'center',
              fontSize: '13px',
              fontWeight: '700',
              color: 'var(--s-text-3)',
            }}
          >
            <span>Order in</span>
            <span>Checked</span>
            <span>With courier</span>
            <span>Cash in</span>
          </div>
        </div>
        <div
          style={{
            marginTop: '72px',
            display: 'grid',
            gridTemplateColumns:
              'repeat(auto-fit, minmax(min(100%, 300px), 1fr))',
            gap: '20px',
          }}
        >
          <article
            data-hover="lift"
            style={{
              background: 'var(--s-card)',
              border: '1px solid rgba(var(--s-ink), 0.08)',
              borderRadius: '24px',
              padding: '30px',
              boxSizing: 'border-box',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
              animation: 'ncom-rise 0.9s cubic-bezier(0.16, 1, 0.3, 1) both',
            }}
          >
            <h3
              style={{
                textWrap: 'balance',
                margin: '0',
                fontFamily:
                  'var(--font-space-grotesk), var(--font-manrope), var(--font-bangla), sans-serif',
                fontWeight: '600',
                fontSize: '22px',
                letterSpacing: '-0.02em',
              }}
            >
              Check each buyer’s delivery record
            </h3>
            <p
              style={{ margin: '0', fontSize: '15px', color: 'var(--s-muted)' }}
            >
              No form stops every fake order. NCOM checks each buyer’s Steadfast
              delivery record against your rules and holds risky orders for you
              to decide.
            </p>
            <div
              aria-hidden="true"
              style={{
                marginTop: 'auto',
                paddingTop: '10px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                fontSize: '12px',
              }}
            >
              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    color: 'var(--s-text-3)',
                  }}
                >
                  <span>01712-XXXXXX</span>
                  <span style={{ color: 'var(--s-ok)', fontWeight: '800' }}>
                    Reliable
                  </span>
                </div>
                <div
                  style={{
                    marginTop: '6px',
                    height: '6px',
                    borderRadius: '999px',
                    background: 'rgba(var(--s-ink), 0.08)',
                    overflow: 'hidden',
                  }}
                >
                  <span
                    style={{
                      display: 'block',
                      width: '95%',
                      height: '100%',
                      background: 'var(--s-ok)',
                      borderRadius: '999px',
                      transformOrigin: 'left',
                      animation:
                        'ncom-underline 1s cubic-bezier(0.16, 1, 0.3, 1) both',
                    }}
                  ></span>
                </div>
              </div>
              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    color: 'var(--s-text-3)',
                  }}
                >
                  <span>01819-XXXXXX</span>
                  <span style={{ color: 'var(--s-warn)', fontWeight: '800' }}>
                    Check first
                  </span>
                </div>
                <div
                  style={{
                    marginTop: '6px',
                    height: '6px',
                    borderRadius: '999px',
                    background: 'rgba(var(--s-ink), 0.08)',
                    overflow: 'hidden',
                  }}
                >
                  <span
                    style={{
                      display: 'block',
                      width: '58%',
                      height: '100%',
                      background: 'var(--s-warn)',
                      borderRadius: '999px',
                      transformOrigin: 'left',
                      animation:
                        'ncom-underline 1s cubic-bezier(0.16, 1, 0.3, 1) both',
                    }}
                  ></span>
                </div>
              </div>
            </div>
          </article>
          <article
            data-hover="lift"
            style={{
              background: 'var(--s-card)',
              border: '1px solid rgba(var(--s-ink), 0.08)',
              borderRadius: '24px',
              padding: '30px',
              boxSizing: 'border-box',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
              animation: 'ncom-rise 0.9s cubic-bezier(0.16, 1, 0.3, 1) both',
            }}
          >
            <h3
              style={{
                textWrap: 'balance',
                margin: '0',
                fontFamily:
                  'var(--font-space-grotesk), var(--font-manrope), var(--font-bangla), sans-serif',
                fontWeight: '600',
                fontSize: '22px',
                letterSpacing: '-0.02em',
              }}
            >
              Book Steadfast or Pathao
            </h3>
            <p
              style={{ margin: '0', fontSize: '15px', color: 'var(--s-muted)' }}
            >
              Book from the order, on your own courier accounts, and statuses
              update on their own. Automatic booking stays off until you switch
              it on. Print 4×6 stickers in one go.
            </p>
            <div
              aria-hidden="true"
              style={{ marginTop: 'auto', paddingTop: '10px' }}
            >
              <div
                style={{
                  background: '#f5f5f0',
                  color: '#0b0b0c',
                  borderRadius: '12px',
                  padding: '12px 14px',
                  fontSize: '11px',
                  lineHeight: '1.45',
                  transform: 'rotate(-1.5deg)',
                  animation: 'ncom-float 6s ease-in-out infinite',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: '8px',
                  }}
                >
                  <span style={{ fontWeight: '800' }}>STEADFAST</span>
                  <span
                    style={{ fontFamily: 'var(--font-geist-mono), monospace' }}
                  >
                    COD ৳1,550
                  </span>
                </div>
                <p style={{ margin: '4px 0 0' }}>
                  Rahima Akter · Mirpur 10, Dhaka · Order #NC-10482
                </p>
                <svg
                  viewBox="0 0 120 22"
                  width="100%"
                  height="22"
                  preserveAspectRatio="none"
                  style={{ display: 'block', marginTop: '6px' }}
                >
                  <g fill="#0b0b0c">
                    <rect x="0" y="0" width="2" height="22"></rect>
                    <rect x="4" y="0" width="1" height="22"></rect>
                    <rect x="7" y="0" width="3" height="22"></rect>
                    <rect x="12" y="0" width="1" height="22"></rect>
                    <rect x="15" y="0" width="2" height="22"></rect>
                    <rect x="19" y="0" width="4" height="22"></rect>
                    <rect x="25" y="0" width="1" height="22"></rect>
                    <rect x="28" y="0" width="2" height="22"></rect>
                    <rect x="32" y="0" width="1" height="22"></rect>
                    <rect x="35" y="0" width="3" height="22"></rect>
                    <rect x="40" y="0" width="2" height="22"></rect>
                    <rect x="44" y="0" width="1" height="22"></rect>
                    <rect x="47" y="0" width="4" height="22"></rect>
                    <rect x="53" y="0" width="1" height="22"></rect>
                    <rect x="56" y="0" width="2" height="22"></rect>
                    <rect x="60" y="0" width="3" height="22"></rect>
                    <rect x="65" y="0" width="1" height="22"></rect>
                    <rect x="68" y="0" width="2" height="22"></rect>
                    <rect x="72" y="0" width="4" height="22"></rect>
                    <rect x="78" y="0" width="1" height="22"></rect>
                    <rect x="81" y="0" width="3" height="22"></rect>
                    <rect x="86" y="0" width="1" height="22"></rect>
                    <rect x="89" y="0" width="2" height="22"></rect>
                    <rect x="93" y="0" width="1" height="22"></rect>
                    <rect x="96" y="0" width="4" height="22"></rect>
                    <rect x="102" y="0" width="2" height="22"></rect>
                    <rect x="106" y="0" width="1" height="22"></rect>
                    <rect x="109" y="0" width="3" height="22"></rect>
                    <rect x="114" y="0" width="1" height="22"></rect>
                    <rect x="117" y="0" width="3" height="22"></rect>
                  </g>
                </svg>
              </div>
            </div>
          </article>
          <article
            data-hover="lift"
            style={{
              background: 'var(--s-card)',
              border: '1px solid rgba(var(--s-ink), 0.08)',
              borderRadius: '24px',
              padding: '30px',
              boxSizing: 'border-box',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
              animation: 'ncom-rise 0.9s cubic-bezier(0.16, 1, 0.3, 1) both',
            }}
          >
            <h3
              style={{
                textWrap: 'balance',
                margin: '0',
                fontFamily:
                  'var(--font-space-grotesk), var(--font-manrope), var(--font-bangla), sans-serif',
                fontWeight: '600',
                fontSize: '22px',
                letterSpacing: '-0.02em',
              }}
            >
              Send the buyer a tracking link
            </h3>
            <p
              style={{ margin: '0', fontSize: '15px', color: 'var(--s-muted)' }}
            >
              Each parcel gets a link that shows where it is and how much cash
              to keep ready. It never shows the address.
            </p>
            <div
              aria-hidden="true"
              style={{
                marginTop: 'auto',
                paddingTop: '10px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                fontSize: '13px',
              }}
            >
              <div
                style={{ display: 'flex', alignItems: 'center', gap: '10px' }}
              >
                <span
                  style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    background: 'var(--accent)',
                    display: 'inline-block',
                  }}
                ></span>
                <span style={{ color: 'var(--s-text-3)' }}>Packed</span>
              </div>
              <div
                style={{ display: 'flex', alignItems: 'center', gap: '10px' }}
              >
                <span
                  style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    background: 'var(--accent)',
                    display: 'inline-block',
                    animation: 'ncom-pulse 2.4s ease-out infinite',
                  }}
                ></span>
                <span style={{ color: 'var(--s-text)', fontWeight: '700' }}>
                  With the courier · keep ৳1,550 ready
                </span>
              </div>
              <div
                style={{ display: 'flex', alignItems: 'center', gap: '10px' }}
              >
                <span
                  style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    border: '2px solid #3f3f46',
                    boxSizing: 'border-box',
                    display: 'inline-block',
                  }}
                ></span>
                <span style={{ color: 'var(--s-subtle)' }}>Delivered</span>
              </div>
            </div>
          </article>
        </div>
      </div>
    </section>
  )
}
