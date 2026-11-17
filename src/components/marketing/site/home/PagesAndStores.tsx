/**
 * Landing page or online store: the two kinds of site, side by side.
 *
 * Ported from the NCOM homepage design (Claude Design canvas, Main.dc.html):
 * inline styles and data-hover hooks as designed; keyframes live in site.css.
 */
export function PagesAndStores() {
  return (
    <section
      id="sell"
      aria-labelledby="sell-title"
      style={{
        maxWidth: '1200px',
        margin: '0 auto',
        padding:
          'clamp(24px, 3vw, 40px) clamp(16px, 4vw, 40px) clamp(72px, 8vw, 116px)',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          animation: 'ncom-reveal linear both',
          animationTimeline: 'view()',
          animationRange: 'entry 0% cover 25%',
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
          Landing page or online store
        </p>
        <h2
          id="sell-title"
          style={{
            textWrap: 'balance',
            margin: '16px 0 0',
            maxWidth: '760px',
            fontFamily:
              'var(--font-space-grotesk), var(--font-manrope), var(--font-bangla), sans-serif',
            fontWeight: '600',
            fontSize: 'clamp(36px, 4.8vw, 64px)',
            lineHeight: '1.02',
            letterSpacing: '-0.032em',
          }}
        >
          A landing page for one product, or a store for everything you sell.
        </h2>
        <p
          style={{
            margin: '20px 0 0',
            maxWidth: '560px',
            fontSize: '18px',
            color: '#c4c4cc',
          }}
        >
          A landing page for each ad, a full store for everything you sell —
          sharing the same products, offers, orders and couriers.
        </p>
      </div>
      <div
        style={{
          marginTop: '56px',
          display: 'grid',
          gridTemplateColumns:
            'repeat(auto-fit, minmax(min(100%, 460px), 1fr))',
          gap: '20px',
        }}
      >
        <article
          data-hover="lift"
          style={{
            position: 'relative',
            overflow: 'hidden',
            background: '#111114',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '28px',
            padding: 'clamp(28px, 3.4vw, 44px)',
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
            gap: '22px',
            animation: 'ncom-reveal linear both',
            animationTimeline: 'view()',
            animationRange: 'entry 0% cover 30%',
          }}
        >
          <p
            style={{
              margin: '0',
              fontSize: '14px',
              fontWeight: '700',
              color: '#c4c4cc',
            }}
          >
            Landing page
          </p>
          <h3
            style={{
              textWrap: 'balance',
              margin: '0',
              fontFamily:
                'var(--font-space-grotesk), var(--font-manrope), var(--font-bangla), sans-serif',
              fontWeight: '600',
              fontSize: 'clamp(26px, 2.6vw, 34px)',
              lineHeight: '1.1',
              letterSpacing: '-0.03em',
            }}
          >
            One product. One page. The order form right on it.
          </h3>
          <p style={{ margin: '0', fontSize: '16px', color: '#c4c4cc' }}>
            Built for Facebook ads: the buyer picks a package, types name, phone
            and address, and taps once. Combos, free gifts and delivery charges
            are set per page.
          </p>
          <div
            aria-hidden="true"
            style={{
              marginTop: 'auto',
              position: 'relative',
              background: '#0b0b0d',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              borderRadius: '20px',
              padding: '18px',
            }}
          >
            <div style={{ position: 'relative', display: 'flex' }}>
              <span
                style={{
                  position: 'absolute',
                  left: '0',
                  top: '0',
                  bottom: '0',
                  width: '33.333%',
                  boxSizing: 'border-box',
                  border: '2px solid var(--accent)',
                  borderRadius: '14px',
                  animation: 'ncom-pick 7s cubic-bezier(.65,0,.35,1) infinite',
                }}
              ></span>
              <div
                style={{ flex: '1 1 0', minWidth: '0', padding: '12px 14px' }}
              >
                <p style={{ margin: '0', fontSize: '14px', fontWeight: '700' }}>
                  Single · 500 g
                </p>
                <p style={{ margin: '0', fontSize: '13px', color: '#a1a1aa' }}>
                  ৳850
                </p>
              </div>
              <div
                style={{ flex: '1 1 0', minWidth: '0', padding: '12px 14px' }}
              >
                <p style={{ margin: '0', fontSize: '14px', fontWeight: '700' }}>
                  Family pack · 2 × 500 g
                </p>
                <p style={{ margin: '0', fontSize: '13px', color: '#a1a1aa' }}>
                  ৳1,550
                </p>
              </div>
              <div
                style={{ flex: '1 1 0', minWidth: '0', padding: '12px 14px' }}
              >
                <p style={{ margin: '0', fontSize: '14px', fontWeight: '700' }}>
                  3 bottles + wooden dipper
                </p>
                <p style={{ margin: '0', fontSize: '13px', color: '#a1a1aa' }}>
                  ৳2,200
                </p>
              </div>
            </div>
            <div
              style={{
                position: 'absolute',
                right: '18px',
                top: '-16px',
                background: '#f5f5f6',
                color: '#0b0b0c',
                borderRadius: '999px',
                padding: '5px 12px',
                fontSize: '12px',
                fontWeight: '800',
                boxShadow: '0 10px 24px rgba(0, 0, 0, 0.45)',
                opacity: '0',
                animation: 'ncom-toast 7s cubic-bezier(.2,.7,.2,1) infinite',
              }}
            >
              New order · Family pack · ৳1,550
            </div>
          </div>
        </article>
        <article
          data-hover="lift"
          style={{
            position: 'relative',
            overflow: 'hidden',
            background: '#111114',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '28px',
            padding: 'clamp(28px, 3.4vw, 44px)',
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
            gap: '22px',
            animation: 'ncom-reveal linear both',
            animationTimeline: 'view()',
            animationRange: 'entry 5% cover 35%',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <p
              style={{
                margin: '0',
                fontSize: '14px',
                fontWeight: '700',
                color: '#c4c4cc',
              }}
            >
              Online store
            </p>
            <span
              aria-hidden="true"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '13px',
                color: '#c4c4cc',
              }}
            >
              <svg
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M6 7h15l-1.5 8.5a2 2 0 0 1-2 1.5H9a2 2 0 0 1-2-1.6L5 4H3"></path>
                <circle cx="10" cy="20.5" r="1"></circle>
                <circle cx="17" cy="20.5" r="1"></circle>
              </svg>
              <span
                style={{
                  display: 'inline-block',
                  height: '1.25em',
                  lineHeight: '1.25em',
                  overflow: 'hidden',
                  background: 'var(--accent)',
                  color: '#0b0b0c',
                  fontWeight: '800',
                  borderRadius: '999px',
                  padding: '0 8px',
                }}
              >
                <span
                  style={{
                    display: 'block',
                    animation:
                      'ncom-roll 7s cubic-bezier(.65,0,.35,1) infinite',
                  }}
                >
                  1<br />2<br />3
                </span>
              </span>
            </span>
          </div>
          <h3
            style={{
              textWrap: 'balance',
              margin: '0',
              fontFamily:
                'var(--font-space-grotesk), var(--font-manrope), var(--font-bangla), sans-serif',
              fontWeight: '600',
              fontSize: 'clamp(26px, 2.6vw, 34px)',
              lineHeight: '1.1',
              letterSpacing: '-0.03em',
            }}
          >
            Your whole catalogue, with a page for every product.
          </h3>
          <p style={{ margin: '0', fontSize: '16px', color: '#c4c4cc' }}>
            Home page, categories, cart, checkout and customer accounts — with
            banners, sliders and product grids you arrange. Cash on delivery and
            bank transfer at checkout.
          </p>
          <div
            aria-hidden="true"
            style={{
              marginTop: 'auto',
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              gap: '10px',
            }}
          >
            <div
              style={{
                position: 'relative',
                overflow: 'hidden',
                background: '#0b0b0d',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                borderRadius: '16px',
                padding: '10px',
              }}
            >
              <div
                style={{
                  height: '76px',
                  borderRadius: '10px',
                  background: 'linear-gradient(160deg, #4b3560, #2a1d36)',
                }}
              ></div>
              <p
                style={{
                  margin: '8px 0 0',
                  fontSize: '13px',
                  fontWeight: '700',
                }}
              >
                Cotton three-piece
              </p>
              <p style={{ margin: '0', fontSize: '12px', color: '#a1a1aa' }}>
                ৳2,450
              </p>
            </div>
            <div
              style={{
                position: 'relative',
                overflow: 'hidden',
                background: '#0b0b0d',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                borderRadius: '16px',
                padding: '10px',
              }}
            >
              <div
                style={{
                  height: '76px',
                  borderRadius: '10px',
                  background: 'linear-gradient(160deg, #7a4330, #3d2118)',
                }}
              ></div>
              <p
                style={{
                  margin: '8px 0 0',
                  fontSize: '13px',
                  fontWeight: '700',
                }}
              >
                Rajshahi silk saree
              </p>
              <p style={{ margin: '0', fontSize: '12px', color: '#a1a1aa' }}>
                ৳4,200
              </p>
            </div>
            <div
              style={{
                position: 'relative',
                overflow: 'hidden',
                background: '#0b0b0d',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                borderRadius: '16px',
                padding: '10px',
              }}
            >
              <div
                style={{
                  height: '76px',
                  borderRadius: '10px',
                  background: 'linear-gradient(160deg, #2b4a66, #172636)',
                }}
              ></div>
              <p
                style={{
                  margin: '8px 0 0',
                  fontSize: '13px',
                  fontWeight: '700',
                }}
              >
                Premium cotton panjabi
              </p>
              <p style={{ margin: '0', fontSize: '12px', color: '#a1a1aa' }}>
                ৳1,850
              </p>
            </div>
          </div>
        </article>
      </div>
    </section>
  )
}
