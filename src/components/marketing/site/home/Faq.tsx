/**
 * Questions sellers ask.
 *
 * Ported from the NCOM homepage design (Claude Design canvas, Main.dc.html):
 * inline styles and data-hover hooks as designed; keyframes live in site.css.
 */
export function Faq() {
  return (
    <section
      id="faq"
      aria-labelledby="faq-title"
      style={{ borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}
    >
      <div
        style={{
          maxWidth: '1200px',
          margin: '0 auto',
          padding: 'clamp(72px, 8vw, 116px) clamp(16px, 4vw, 40px)',
          boxSizing: 'border-box',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 'clamp(32px, 6vw, 96px)',
        }}
      >
        <div
          style={{
            flex: '1 1 300px',
            minWidth: '0',
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
              color: 'var(--accent)',
            }}
          >
            Questions
          </p>
          <h2
            id="faq-title"
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
            Questions sellers ask
          </h2>
        </div>
        <div
          style={{
            flex: '2 1 560px',
            minWidth: '0',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <details
            data-faq=""
            open
            style={{ borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}
          >
            <summary
              style={{
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '16px',
                fontWeight: '700',
                fontSize: '18px',
                minHeight: '44px',
                padding: '18px 0',
                boxSizing: 'border-box',
              }}
            >
              My buyers are on Facebook. Why a page?
              <span
                data-plus=""
                aria-hidden="true"
                style={{
                  flex: '0 0 auto',
                  display: 'inline-flex',
                  color: '#c4c4cc',
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="22"
                  height="22"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                >
                  <path d="M12 5v14M5 12h14"></path>
                </svg>
              </span>
            </summary>
            <p
              style={{
                margin: '0 0 22px',
                maxWidth: '640px',
                color: '#d4d4d8',
              }}
            >
              Keep your page. Your ads land on one page with the price, the
              offer and the order form, so buyers don’t wait for an inbox reply.
            </p>
          </details>
          <details
            data-faq=""
            open
            style={{ borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}
          >
            <summary
              style={{
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '16px',
                fontWeight: '700',
                fontSize: '18px',
                minHeight: '44px',
                padding: '18px 0',
                boxSizing: 'border-box',
              }}
            >
              Will this stop fake orders?
              <span
                data-plus=""
                aria-hidden="true"
                style={{
                  flex: '0 0 auto',
                  display: 'inline-flex',
                  color: '#c4c4cc',
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="22"
                  height="22"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                >
                  <path d="M12 5v14M5 12h14"></path>
                </svg>
              </span>
            </summary>
            <p
              style={{
                margin: '0 0 22px',
                maxWidth: '640px',
                color: '#d4d4d8',
              }}
            >
              No form can. NCOM checks each buyer’s Steadfast delivery record
              and holds risky orders for you to decide. You’ll need your own
              Steadfast merchant login.
            </p>
          </details>
          <details
            data-faq=""
            style={{ borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}
          >
            <summary
              style={{
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '16px',
                fontWeight: '700',
                fontSize: '18px',
                minHeight: '44px',
                padding: '18px 0',
                boxSizing: 'border-box',
              }}
            >
              I use RedX or Paperfly.
              <span
                data-plus=""
                aria-hidden="true"
                style={{
                  flex: '0 0 auto',
                  display: 'inline-flex',
                  color: '#c4c4cc',
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="22"
                  height="22"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                >
                  <path d="M12 5v14M5 12h14"></path>
                </svg>
              </span>
            </summary>
            <p
              style={{
                margin: '0 0 22px',
                maxWidth: '640px',
                color: '#d4d4d8',
              }}
            >
              Booking works with Steadfast and Pathao. With other couriers you
              still take orders and print stickers.
            </p>
          </details>
          <details
            data-faq=""
            style={{ borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}
          >
            <summary
              style={{
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '16px',
                fontWeight: '700',
                fontSize: '18px',
                minHeight: '44px',
                padding: '18px 0',
                boxSizing: 'border-box',
              }}
            >
              Can buyers pay by bKash?
              <span
                data-plus=""
                aria-hidden="true"
                style={{
                  flex: '0 0 auto',
                  display: 'inline-flex',
                  color: '#c4c4cc',
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="22"
                  height="22"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                >
                  <path d="M12 5v14M5 12h14"></path>
                </svg>
              </span>
            </summary>
            <p
              style={{
                margin: '0 0 22px',
                maxWidth: '640px',
                color: '#d4d4d8',
              }}
            >
              Not yet. Landing pages are cash on delivery, and stores can add
              bank transfer. bKash, Nagad and Rocket are for paying NCOM.
            </p>
          </details>
          <details
            data-faq=""
            style={{ borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}
          >
            <summary
              style={{
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '16px',
                fontWeight: '700',
                fontSize: '18px',
                minHeight: '44px',
                padding: '18px 0',
                boxSizing: 'border-box',
              }}
            >
              Do you take a cut?
              <span
                data-plus=""
                aria-hidden="true"
                style={{
                  flex: '0 0 auto',
                  display: 'inline-flex',
                  color: '#c4c4cc',
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="22"
                  height="22"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                >
                  <path d="M12 5v14M5 12h14"></path>
                </svg>
              </span>
            </summary>
            <p
              style={{
                margin: '0 0 22px',
                maxWidth: '640px',
                color: '#d4d4d8',
              }}
            >
              No. You pay for your package — from ৳199 a month — and nothing per
              order. A year costs eleven months.
            </p>
          </details>
          <details
            data-faq=""
            style={{ borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}
          >
            <summary
              style={{
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '16px',
                fontWeight: '700',
                fontSize: '18px',
                minHeight: '44px',
                padding: '18px 0',
                boxSizing: 'border-box',
              }}
            >
              Can I try it before I pay?
              <span
                data-plus=""
                aria-hidden="true"
                style={{
                  flex: '0 0 auto',
                  display: 'inline-flex',
                  color: '#c4c4cc',
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="22"
                  height="22"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                >
                  <path d="M12 5v14M5 12h14"></path>
                </svg>
              </span>
            </summary>
            <p
              style={{
                margin: '0 0 22px',
                maxWidth: '640px',
                color: '#d4d4d8',
              }}
            >
              Yes. Lite, Starter, Business and Pro each start with a 7-day free
              trial — no payment needed. Pay before it ends to keep going; if
              you don’t, your sites pause until you do, and nothing is deleted.
            </p>
          </details>
          <details
            data-faq=""
            style={{ borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}
          >
            <summary
              style={{
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '16px',
                fontWeight: '700',
                fontSize: '18px',
                minHeight: '44px',
                padding: '18px 0',
                boxSizing: 'border-box',
              }}
            >
              I can’t design.
              <span
                data-plus=""
                aria-hidden="true"
                style={{
                  flex: '0 0 auto',
                  display: 'inline-flex',
                  color: '#c4c4cc',
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="22"
                  height="22"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                >
                  <path d="M12 5v14M5 12h14"></path>
                </svg>
              </span>
            </summary>
            <p
              style={{
                margin: '0 0 22px',
                maxWidth: '640px',
                color: '#d4d4d8',
              }}
            >
              Pick a template, describe your product to the AI (this uses
              credits), or paste NCOM’s prompt into ChatGPT for free.
            </p>
          </details>
          <details
            data-faq=""
            style={{ borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}
          >
            <summary
              style={{
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '16px',
                fontWeight: '700',
                fontSize: '18px',
                minHeight: '44px',
                padding: '18px 0',
                boxSizing: 'border-box',
              }}
            >
              Is it in Bangla?
              <span
                data-plus=""
                aria-hidden="true"
                style={{
                  flex: '0 0 auto',
                  display: 'inline-flex',
                  color: '#c4c4cc',
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="22"
                  height="22"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                >
                  <path d="M12 5v14M5 12h14"></path>
                </svg>
              </span>
            </summary>
            <p
              style={{
                margin: '0 0 22px',
                maxWidth: '640px',
                color: '#d4d4d8',
              }}
            >
              Your shop can be, numerals and order form included. The dashboard
              is in English.
            </p>
          </details>
          <details
            data-faq=""
            style={{
              borderTop: '1px solid rgba(255, 255, 255, 0.1)',
              borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            }}
          >
            <summary
              style={{
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '16px',
                fontWeight: '700',
                fontSize: '18px',
                minHeight: '44px',
                padding: '18px 0',
                boxSizing: 'border-box',
              }}
            >
              My team needs access.
              <span
                data-plus=""
                aria-hidden="true"
                style={{
                  flex: '0 0 auto',
                  display: 'inline-flex',
                  color: '#c4c4cc',
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="22"
                  height="22"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                >
                  <path d="M12 5v14M5 12h14"></path>
                </svg>
              </span>
            </summary>
            <p
              style={{
                margin: '0 0 22px',
                maxWidth: '640px',
                color: '#d4d4d8',
              }}
            >
              Invite moderators and packers as Viewer, Editor or Admin. Business
              includes three seats and Pro five; extra seats are ৳199 a month.
            </p>
          </details>
        </div>
      </div>
    </section>
  )
}
