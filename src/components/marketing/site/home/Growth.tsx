/**
 * Ads tracking and the money view: what Facebook sees, what was collected.
 *
 * Ported from the NCOM homepage design (Claude Design canvas, Main.dc.html):
 * inline styles and data-hover hooks as designed; keyframes live in site.css.
 */
export function Growth() {
  return (
    <section
      id="growth"
      aria-labelledby="growth-title"
      style={{
        borderTop: '1px solid rgba(255, 255, 255, 0.06)',
        background: '#0b0b0d',
      }}
    >
      <div
        style={{
          maxWidth: '1200px',
          margin: '0 auto',
          padding: 'clamp(72px, 8vw, 116px) clamp(16px, 4vw, 40px)',
          boxSizing: 'border-box',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 'clamp(40px, 6vw, 80px)',
          alignItems: 'center',
        }}
      >
        <div
          style={{
            flex: '1 1 420px',
            minWidth: '0',
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
            Ads &amp; reports · every package
          </p>
          <h2
            id="growth-title"
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
            Facebook sees each sale. You see what was collected.
          </h2>
          <p
            style={{
              margin: '20px 0 0',
              maxWidth: '500px',
              fontSize: '18px',
              color: '#c4c4cc',
            }}
          >
            Meta Pixel and Conversions API are sent from the server, where an ad
            blocker cannot stop them, and each sale is counted once. GA4 and Tag
            Manager too. Then see what you invoiced, what was collected and
            which page brought the orders.
          </p>
          <p style={{ margin: '22px 0 0', fontSize: '14px', color: '#a1a1aa' }}>
            Meta Pixel + Conversions API · Google Analytics 4 on every package ·
            Google Tag Manager from Starter.
          </p>
        </div>
        <div
          role="img"
          aria-label="NCOM sales report with sample numbers: invoiced, collected, delivery rate and orders by day"
          style={{
            flex: '1 1 480px',
            minWidth: '0',
            background: '#111114',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '24px',
            padding: 'clamp(20px, 2.6vw, 32px)',
            boxSizing: 'border-box',
            boxShadow: '0 60px 140px rgba(0, 0, 0, 0.5)',
            animation: 'ncom-rise 0.9s cubic-bezier(0.16, 1, 0.3, 1) both',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '10px',
            }}
          >
            <p style={{ margin: '0', fontWeight: '700' }}>Sales · this month</p>
            <span
              style={{
                fontFamily: 'var(--font-geist-mono), monospace',
                fontSize: '11px',
                color: '#a1a1aa',
                letterSpacing: '0.1em',
              }}
            >
              SAMPLE
            </span>
          </div>
          <div
            style={{
              marginTop: '20px',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '28px',
              alignItems: 'center',
            }}
          >
            <div
              style={{
                flex: '1 1 200px',
                minWidth: '0',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
              }}
            >
              <div>
                <p style={{ margin: '0', fontSize: '13px', color: '#a1a1aa' }}>
                  Invoiced
                </p>
                <p
                  style={{
                    margin: '2px 0 0',
                    fontFamily:
                      'var(--font-space-grotesk), var(--font-bangla), sans-serif',
                    fontSize: '32px',
                    fontWeight: '600',
                    letterSpacing: '-0.02em',
                  }}
                >
                  ৳248,500
                </p>
              </div>
              <div>
                <p style={{ margin: '0', fontSize: '13px', color: '#a1a1aa' }}>
                  Collected
                </p>
                <p
                  style={{
                    margin: '2px 0 0',
                    fontFamily:
                      'var(--font-space-grotesk), var(--font-bangla), sans-serif',
                    fontSize: '32px',
                    fontWeight: '600',
                    letterSpacing: '-0.02em',
                    color: 'var(--accent)',
                  }}
                >
                  ৳196,200
                </p>
              </div>
            </div>
            <div
              style={{
                position: 'relative',
                width: '132px',
                height: '132px',
                flex: '0 0 auto',
              }}
            >
              <svg
                viewBox="0 0 120 120"
                width="132"
                height="132"
                aria-hidden="true"
                style={{ transform: 'rotate(-90deg)' }}
              >
                <circle
                  cx="60"
                  cy="60"
                  r="48"
                  fill="none"
                  stroke="#24242a"
                  strokeWidth="10"
                ></circle>
                <circle
                  cx="60"
                  cy="60"
                  r="48"
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray="302"
                  strokeDashoffset="42"
                  style={{
                    animation:
                      'ncom-ring 1.8s cubic-bezier(0.16, 1, 0.3, 1) both',
                  }}
                ></circle>
              </svg>
              <div
                style={{
                  position: 'absolute',
                  inset: '0',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-space-grotesk), sans-serif',
                    fontSize: '26px',
                    fontWeight: '600',
                  }}
                >
                  79%
                </span>
                <span style={{ fontSize: '11px', color: '#a1a1aa' }}>
                  delivered
                </span>
              </div>
            </div>
          </div>
          <div
            aria-hidden="true"
            style={{
              marginTop: '26px',
              height: '120px',
              display: 'flex',
              alignItems: 'flex-end',
              gap: '8px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              paddingBottom: '1px',
            }}
          >
            <span
              style={{
                flex: '1',
                height: '38%',
                borderRadius: '6px 6px 2px 2px',
                background: '#2a2a31',
                transformOrigin: 'bottom',
                animation: 'ncom-grow 1.3s cubic-bezier(0.16, 1, 0.3, 1) both',
              }}
            ></span>
            <span
              style={{
                flex: '1',
                height: '52%',
                borderRadius: '6px 6px 2px 2px',
                background: '#2a2a31',
                transformOrigin: 'bottom',
                animation: 'ncom-grow 1.3s cubic-bezier(0.16, 1, 0.3, 1) both',
              }}
            ></span>
            <span
              style={{
                flex: '1',
                height: '46%',
                borderRadius: '6px 6px 2px 2px',
                background: '#2a2a31',
                transformOrigin: 'bottom',
                animation: 'ncom-grow 1.3s cubic-bezier(0.16, 1, 0.3, 1) both',
              }}
            ></span>
            <span
              style={{
                flex: '1',
                height: '70%',
                borderRadius: '6px 6px 2px 2px',
                background: '#2a2a31',
                transformOrigin: 'bottom',
                animation: 'ncom-grow 1.3s cubic-bezier(0.16, 1, 0.3, 1) both',
              }}
            ></span>
            <span
              style={{
                flex: '1',
                height: '64%',
                borderRadius: '6px 6px 2px 2px',
                background: '#2a2a31',
                transformOrigin: 'bottom',
                animation: 'ncom-grow 1.3s cubic-bezier(0.16, 1, 0.3, 1) both',
              }}
            ></span>
            <span
              style={{
                flex: '1',
                height: '86%',
                borderRadius: '6px 6px 2px 2px',
                background: 'var(--accent)',
                transformOrigin: 'bottom',
                animation: 'ncom-grow 1.3s cubic-bezier(0.16, 1, 0.3, 1) both',
              }}
            ></span>
            <span
              style={{
                flex: '1',
                height: '78%',
                borderRadius: '6px 6px 2px 2px',
                background: '#2a2a31',
                transformOrigin: 'bottom',
                animation: 'ncom-grow 1.3s cubic-bezier(0.16, 1, 0.3, 1) both',
              }}
            ></span>
          </div>
          <div
            style={{
              marginTop: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              fontSize: '13px',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: '8px',
              }}
            >
              <span style={{ color: '#d4d4d8' }}>Honey — Facebook ad</span>
              <span style={{ color: '#a1a1aa' }}>128 orders</span>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: '8px',
              }}
            >
              <span style={{ color: '#d4d4d8' }}>Ghee combo — Eid offer</span>
              <span style={{ color: '#a1a1aa' }}>74 orders</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
