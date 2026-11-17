import Link from 'next/link'

/**
 * Opening: the promise, the two ways in, and a live page being made and ordered from.
 *
 * Ported from the NCOM homepage design (Claude Design canvas, Main.dc.html):
 * inline styles and data-hover hooks as designed; keyframes live in site.css.
 */
export function Hero() {
  return (
    <section
      id="top"
      aria-labelledby="hero-title"
      style={{ position: 'relative', overflow: 'hidden' }}
    >
      <div
        style={{
          position: 'relative',
          maxWidth: '1200px',
          margin: '0 auto',
          padding:
            'clamp(56px, 8vw, 112px) clamp(16px, 4vw, 40px) clamp(64px, 8vw, 104px)',
          boxSizing: 'border-box',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 'clamp(48px, 6vw, 80px)',
          alignItems: 'center',
        }}
      >
        <div style={{ flex: '1 1 440px', minWidth: '0' }}>
          <p
            style={{
              margin: '0 0 22px',
              fontSize: '15px',
              fontWeight: '700',
              color: 'var(--accent)',
              animation: 'ncom-fade-up .9s cubic-bezier(.2,.7,.2,1) both',
            }}
          >
            For Facebook sellers in Bangladesh
          </p>
          <h1
            id="hero-title"
            style={{
              textWrap: 'balance',
              margin: '0',
              fontFamily:
                'var(--font-space-grotesk), var(--font-manrope), var(--font-bangla), sans-serif',
              fontWeight: '600',
              fontSize: 'clamp(42px, 4.6vw, 68px)',
              lineHeight: '1',
              letterSpacing: '-0.032em',
            }}
          >
            <span
              style={{
                display: 'inline-block',
                whiteSpace: 'nowrap',
                animation: 'ncom-word 1s cubic-bezier(.2,.7,.2,1) .05s both',
              }}
            >
              Make a landing
            </span>
            <br />
            <span
              style={{
                display: 'inline-block',
                whiteSpace: 'nowrap',
                animation: 'ncom-word 1s cubic-bezier(.2,.7,.2,1) .15s both',
              }}
            >
              page or an
            </span>
            <br />
            <span
              style={{
                display: 'inline-block',
                whiteSpace: 'nowrap',
                animation: 'ncom-word 1s cubic-bezier(.2,.7,.2,1) .25s both',
              }}
            >
              online store
            </span>
            <br />
            <span
              style={{
                display: 'inline-block',
                position: 'relative',
                whiteSpace: 'nowrap',
                color: 'var(--accent)',
                animation: 'ncom-word 1s cubic-bezier(.2,.7,.2,1) .4s both',
              }}
            >
              in minutes.
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  left: '0.02em',
                  right: '0.3em',
                  bottom: '0.02em',
                  height: '0.06em',
                  borderRadius: '999px',
                  background: 'var(--accent)',
                  transformOrigin: 'left',
                  animation:
                    'ncom-underline 1.1s cubic-bezier(.65,0,.35,1) 1.1s both',
                }}
              ></span>
            </span>
          </h1>
          <p
            style={{
              margin: '30px 0 0',
              maxWidth: '520px',
              fontSize: 'clamp(17px, 1.45vw, 19px)',
              lineHeight: '1.6',
              color: '#e4e4e7',
              animation: 'ncom-fade-up 1s cubic-bezier(.2,.7,.2,1) .7s both',
            }}
          >
            Your page takes cash-on-delivery orders, in Bangla or English. NCOM
            checks each buyer’s Steadfast delivery record and books Steadfast or
            Pathao from the order.
          </p>
          <div
            style={{
              marginTop: '38px',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '12px',
              animation: 'ncom-fade-up 1s cubic-bezier(.2,.7,.2,1) .85s both',
            }}
          >
            <Link
              href="/register"
              data-hover="btn"
              style={{
                background: 'var(--accent)',
                color: '#0b0b0c',
                textDecoration: 'none',
                fontWeight: '700',
                fontSize: '16px',
                padding: '0 26px',
                minHeight: '54px',
                borderRadius: '12px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              Start free trial{' '}
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
            <a
              href="#flow"
              data-hover="ghost"
              style={{
                color: '#f5f5f6',
                textDecoration: 'none',
                fontWeight: '600',
                fontSize: '16px',
                padding: '0 24px',
                minHeight: '54px',
                borderRadius: '12px',
                border: '1px solid rgba(255, 255, 255, 0.14)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              See how an order moves
            </a>
          </div>
          <p
            style={{
              margin: '22px 0 0',
              maxWidth: '520px',
              fontSize: '15px',
              lineHeight: '1.55',
              color: '#d4d4d8',
              animation: 'ncom-fade-up 1s cubic-bezier(.2,.7,.2,1) 1s both',
            }}
          >
            7-day free trial, no payment needed to start. Packages from ৳199 a
            month.
          </p>
        </div>
        <div
          style={{
            flex: '1 1 520px',
            minWidth: '0',
            animation: 'ncom-fade-up 1.2s cubic-bezier(.2,.7,.2,1) .4s both',
          }}
        >
          <div
            role="img"
            aria-label="A 16-second animation: a seller describes Madhuban Organics' Sundarbans honey in Bangla, NCOM builds the landing page on a phone, an order arrives, the buyer's delivery history is checked, the parcel is booked with Steadfast, and the cash is collected"
            style={{
              position: 'relative',
              width: 'min(100%, 600px)',
              marginInline: 'auto',
              aspectRatio: '600 / 640',
              containerType: 'inline-size',
              borderRadius: '28px',
              overflow: 'hidden',
              background: '#0f0f12',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              boxShadow:
                '0 60px 140px rgba(0, 0, 0, 0.65), inset 0 1px 0 rgba(255, 255, 255, 0.06)',
              fontFamily: 'var(--font-manrope), var(--font-bangla), sans-serif',
            }}
          >
            <div
              aria-hidden="true"
              style={{
                position: 'absolute',
                inset: '0',
                backgroundImage:
                  'linear-gradient(rgba(255, 255, 255, 0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.035) 1px, transparent 1px)',
                backgroundSize: '8cqw 8cqw',
                WebkitMaskImage:
                  'radial-gradient(ellipse at 50% 40%, #000 30%, transparent 75%)',
                maskImage:
                  'radial-gradient(ellipse at 50% 40%, #000 30%, transparent 75%)',
              }}
            ></div>
            <div
              style={{
                position: 'absolute',
                left: '4.5cqw',
                right: '4.5cqw',
                top: '4.5cqw',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '2cqw',
              }}
            >
              <div style={{ display: 'flex', gap: '1.4cqw' }}>
                <span
                  style={{
                    fontSize: '2cqw',
                    fontWeight: '700',
                    padding: '0.7cqw 1.8cqw',
                    borderRadius: '999px',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    color: '#c4c4cc',
                    animation: 'ncom-f-c1 16s infinite',
                  }}
                >
                  1 You describe
                </span>
                <span
                  style={{
                    fontSize: '2cqw',
                    fontWeight: '700',
                    padding: '0.7cqw 1.8cqw',
                    borderRadius: '999px',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    color: '#c4c4cc',
                    animation: 'ncom-f-c2 16s infinite',
                  }}
                >
                  2 NCOM builds
                </span>
                <span
                  style={{
                    fontSize: '2cqw',
                    fontWeight: '700',
                    padding: '0.7cqw 1.8cqw',
                    borderRadius: '999px',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    color: '#c4c4cc',
                    animation: 'ncom-f-c3 16s infinite',
                  }}
                >
                  3 Order checked
                </span>
                <span
                  style={{
                    fontSize: '2cqw',
                    fontWeight: '700',
                    padding: '0.7cqw 1.8cqw',
                    borderRadius: '999px',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    color: '#c4c4cc',
                    animation: 'ncom-f-c4 16s infinite',
                  }}
                >
                  4 Parcel booked
                </span>
              </div>
            </div>
            <div
              style={{
                position: 'absolute',
                left: '10cqw',
                top: '22cqw',
                width: '80cqw',
                boxSizing: 'border-box',
                background: '#16161a',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '3.4cqw',
                padding: '3.6cqw',
                boxShadow: '0 4cqw 10cqw rgba(0, 0, 0, 0.5)',
                opacity: '0',
                animation:
                  'ncom-f-prompt 16s cubic-bezier(.2,.7,.2,1) infinite',
              }}
            >
              <p
                style={{
                  margin: '0',
                  fontSize: '2.1cqw',
                  fontWeight: '700',
                  color: '#c4c4cc',
                }}
              >
                Tell us about your business
              </p>
              <div
                style={{
                  marginTop: '2cqw',
                  background: '#0c0c0f',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '2.2cqw',
                  padding: '2.6cqw 3cqw',
                  fontFamily: 'var(--font-bangla), sans-serif',
                  fontSize: '2.9cqw',
                  lineHeight: '1.6',
                  color: '#f5f5f6',
                }}
              >
                <span
                  style={{
                    display: 'block',
                    whiteSpace: 'nowrap',
                    animation: 'ncom-f-type1 16s infinite',
                  }}
                >
                  মধুবন অর্গানিক্স: সুন্দরবনের কাঁচা মধু, ৫০০ গ্রাম, ৮৫০ টাকা।
                </span>
                <span style={{ display: 'block', whiteSpace: 'nowrap' }}>
                  <span
                    style={{
                      display: 'inline-block',
                      animation: 'ncom-f-type2 16s infinite',
                    }}
                  >
                    ঢাকায় ডেলিভারি ফ্রি, পেমেন্ট ক্যাশ অন ডেলিভারি।
                  </span>
                  <span
                    aria-hidden="true"
                    style={{
                      display: 'inline-block',
                      width: '0.35cqw',
                      height: '3.2cqw',
                      marginLeft: '0.6cqw',
                      verticalAlign: '-0.6cqw',
                      background: 'var(--accent)',
                      animation: 'ncom-blink 1s steps(1) infinite',
                    }}
                  ></span>
                </span>
              </div>
              <div
                style={{
                  marginTop: '2.6cqw',
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '2cqw',
                }}
              >
                <div
                  style={{ display: 'flex', gap: '1.2cqw', fontSize: '1.9cqw' }}
                >
                  <span
                    style={{
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      color: '#c4c4cc',
                      borderRadius: '999px',
                      padding: '0.6cqw 1.8cqw',
                    }}
                  >
                    Clean and minimal
                  </span>
                  <span
                    style={{
                      border: '1px solid var(--accent)',
                      color: '#f5f5f6',
                      borderRadius: '999px',
                      padding: '0.6cqw 1.8cqw',
                    }}
                  >
                    Bold and colourful
                  </span>
                </div>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '1.2cqw',
                    background: 'var(--accent)',
                    color: '#0b0b0c',
                    fontWeight: '800',
                    fontSize: '2.2cqw',
                    padding: '1.4cqw 2.8cqw',
                    borderRadius: '999px',
                    animation: 'ncom-f-press 16s infinite',
                  }}
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="12"
                    height="12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.25"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    style={{ width: '2.4cqw', height: '2.4cqw' }}
                  >
                    <path d="M12 3l1.9 5.6L19.5 10.5 13.9 12.4 12 18l-1.9-5.6L4.5 10.5l5.6-1.9z"></path>
                  </svg>{' '}
                  Design my page{' '}
                </span>
              </div>
            </div>
            <div
              style={{
                position: 'absolute',
                left: '7cqw',
                top: '14cqw',
                width: '40cqw',
                aspectRatio: '9 / 18.6',
                boxSizing: 'border-box',
                background: '#1b1b1f',
                border: '1px solid #2e2e35',
                borderRadius: '6.4cqw',
                padding: '1.3cqw',
                boxShadow: '0 6cqw 14cqw rgba(0, 0, 0, 0.6)',
                animation: 'ncom-f-phone 16s cubic-bezier(.2,.7,.2,1) infinite',
              }}
            >
              <div
                style={{
                  height: '100%',
                  borderRadius: '5.2cqw',
                  overflow: 'hidden',
                  background: '#fffaf0',
                  fontFamily: 'var(--font-bangla), sans-serif',
                  color: '#2b1d0e',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <div
                  style={{
                    height: '4.4cqw',
                    flex: '0 0 auto',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                >
                  <span
                    style={{
                      width: '12cqw',
                      height: '2.8cqw',
                      background: '#1b1b1f',
                      borderRadius: '999px',
                      display: 'block',
                    }}
                  ></span>
                </div>
                <div style={{ animation: 'ncom-f-b1 16s infinite' }}>
                  <div
                    style={{
                      background: '#2b1d0e',
                      color: '#ffe9b8',
                      fontSize: '1.7cqw',
                      fontWeight: '600',
                      textAlign: 'center',
                      padding: '0.7cqw',
                    }}
                  >
                    ঢাকার ভেতরে ফ্রি ডেলিভারি
                  </div>
                  <div
                    style={{
                      background: '#f6d79c',
                      height: '17cqw',
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'center',
                    }}
                  >
                    <svg
                      viewBox="0 0 160 124"
                      aria-hidden="true"
                      style={{ width: '18cqw', height: 'auto' }}
                    >
                      <polygon
                        points="22,86 31,81 40,86 40,96 31,101 22,96"
                        fill="#e9b45a"
                      ></polygon>
                      <polygon
                        points="128,30 137,25 146,30 146,40 137,45 128,40"
                        fill="#e9b45a"
                      ></polygon>
                      <polygon
                        points="138,50 145,46 152,50 152,58 145,62 138,58"
                        fill="#efc77e"
                      ></polygon>
                      <rect
                        x="52"
                        y="10"
                        width="56"
                        height="16"
                        rx="4"
                        fill="#3b2a17"
                      ></rect>
                      <rect
                        x="58"
                        y="25"
                        width="44"
                        height="8"
                        rx="2"
                        fill="#c98a2b"
                      ></rect>
                      <rect
                        x="40"
                        y="32"
                        width="80"
                        height="86"
                        rx="20"
                        fill="#e39a2f"
                      ></rect>
                      <rect
                        x="49"
                        y="42"
                        width="9"
                        height="62"
                        rx="4.5"
                        fill="#f4c26a"
                      ></rect>
                      <rect
                        x="58"
                        y="56"
                        width="46"
                        height="36"
                        rx="7"
                        fill="#fff6e3"
                      ></rect>
                      <rect
                        x="65"
                        y="64"
                        width="32"
                        height="6"
                        rx="3"
                        fill="#7a4b12"
                      ></rect>
                      <rect
                        x="68"
                        y="75"
                        width="26"
                        height="4"
                        rx="2"
                        fill="#c08a3e"
                      ></rect>
                    </svg>
                  </div>
                </div>
                <div
                  style={{
                    padding: '2cqw 2.4cqw 0',
                    animation: 'ncom-f-b2 16s infinite',
                  }}
                >
                  <p
                    style={{
                      margin: '0',
                      fontSize: '1.5cqw',
                      fontWeight: '600',
                      color: '#8a5a14',
                    }}
                  >
                    মধুবন অর্গানিক্স · ল্যাব-টেস্টেড
                  </p>
                  <p
                    style={{
                      margin: '0.3cqw 0 0',
                      fontSize: '3.1cqw',
                      lineHeight: '1.25',
                      fontWeight: '700',
                    }}
                  >
                    সুন্দরবনের কাঁচা মধু
                  </p>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      gap: '1.2cqw',
                      marginTop: '0.6cqw',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '3cqw',
                        fontWeight: '700',
                        color: '#a14a05',
                      }}
                    >
                      ৳৮৫০
                    </span>
                    <span
                      style={{
                        fontSize: '1.8cqw',
                        color: '#8f7e69',
                        textDecoration: 'line-through',
                      }}
                    >
                      ৳১,০৫০
                    </span>
                    <span
                      style={{
                        fontSize: '1.5cqw',
                        fontWeight: '600',
                        background: '#2b1d0e',
                        color: '#ffe9b8',
                        borderRadius: '0.8cqw',
                        padding: '0 1cqw',
                      }}
                    >
                      ৫০০ গ্রাম
                    </span>
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '1.2cqw',
                      marginTop: '1.6cqw',
                    }}
                  >
                    <div
                      style={{
                        border: '1px solid #e8d8bd',
                        borderRadius: '1.4cqw',
                        padding: '0.9cqw 1.3cqw',
                        background: '#ffffff',
                      }}
                    >
                      <p
                        style={{
                          margin: '0',
                          fontSize: '1.6cqw',
                          fontWeight: '700',
                        }}
                      >
                        ১ বোতল · ৫০০ গ্রাম
                      </p>
                      <p
                        style={{
                          margin: '0',
                          fontSize: '1.5cqw',
                          color: '#6b5a45',
                        }}
                      >
                        ৳৮৫০
                      </p>
                    </div>
                    <div
                      style={{
                        border: '0.3cqw solid #a14a05',
                        borderRadius: '1.4cqw',
                        padding: '0.8cqw 1.2cqw',
                        background: '#ffffff',
                      }}
                    >
                      <p
                        style={{
                          margin: '0',
                          fontSize: '1.6cqw',
                          fontWeight: '700',
                        }}
                      >
                        ফ্যামিলি প্যাক · ২ বোতল
                      </p>
                      <p
                        style={{
                          margin: '0',
                          fontSize: '1.5cqw',
                          color: '#6b5a45',
                        }}
                      >
                        ৳১,৫৫০
                      </p>
                    </div>
                  </div>
                </div>
                <div
                  style={{
                    padding: '1.4cqw 2.4cqw 2.4cqw',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.9cqw',
                    animation: 'ncom-f-b3 16s infinite',
                  }}
                >
                  <div
                    style={{
                      border: '1px solid #e8d8bd',
                      borderRadius: '1.2cqw',
                      background: '#ffffff',
                      padding: '1cqw 1.4cqw',
                      fontSize: '1.6cqw',
                      color: '#7d6c58',
                    }}
                  >
                    আপনার নাম *
                  </div>
                  <div
                    style={{
                      border: '1px solid #e8d8bd',
                      borderRadius: '1.2cqw',
                      background: '#ffffff',
                      padding: '1cqw 1.4cqw',
                      fontSize: '1.6cqw',
                      color: '#7d6c58',
                    }}
                  >
                    মোবাইল নম্বর *
                  </div>
                  <div
                    style={{
                      border: '1px solid #e8d8bd',
                      borderRadius: '1.2cqw',
                      background: '#ffffff',
                      padding: '1cqw 1.4cqw',
                      fontSize: '1.6cqw',
                      color: '#7d6c58',
                    }}
                  >
                    সম্পূর্ণ ঠিকানা *
                  </div>
                  <div
                    style={{
                      marginTop: '0.4cqw',
                      background: '#a14a05',
                      color: '#ffffff',
                      textAlign: 'center',
                      borderRadius: '1.3cqw',
                      padding: '1.3cqw',
                      fontSize: '2.1cqw',
                      fontWeight: '700',
                      animation: 'ncom-f-tap 16s infinite',
                    }}
                  >
                    অর্ডার কনফার্ম করুন
                  </div>
                  <p
                    style={{
                      margin: '0',
                      textAlign: 'center',
                      fontSize: '1.4cqw',
                      color: '#6b5a45',
                    }}
                  >
                    ক্যাশ অন ডেলিভারি
                  </p>
                </div>
              </div>
            </div>
            <div
              style={{
                position: 'absolute',
                left: '24cqw',
                top: '16cqw',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '1.2cqw',
                background: '#f5f5f6',
                color: '#0b0b0c',
                borderRadius: '999px',
                padding: '1.2cqw 2.4cqw',
                fontSize: '2cqw',
                fontWeight: '700',
                whiteSpace: 'nowrap',
                boxShadow: '0 3cqw 8cqw rgba(0, 0, 0, 0.45)',
                opacity: '0',
                animation: 'ncom-f-pub 16s cubic-bezier(.2,.7,.2,1) infinite',
              }}
            >
              <span
                style={{
                  width: '1.6cqw',
                  height: '1.6cqw',
                  borderRadius: '50%',
                  background: '#16a34a',
                  display: 'inline-block',
                }}
              ></span>
              Published · your NCOM address{' '}
            </div>
            <div
              style={{
                position: 'absolute',
                left: '52cqw',
                top: '17cqw',
                width: '42cqw',
                boxSizing: 'border-box',
                background: '#16161a',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '3cqw',
                padding: '2.6cqw 2.8cqw',
                boxShadow: '0 4cqw 10cqw rgba(0, 0, 0, 0.5)',
                animation: 'ncom-f-order 16s cubic-bezier(.2,.7,.2,1) infinite',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '1cqw',
                }}
              >
                <span
                  style={{
                    background: 'var(--accent)',
                    color: '#0b0b0c',
                    fontSize: '1.8cqw',
                    fontWeight: '800',
                    borderRadius: '999px',
                    padding: '0.3cqw 1.6cqw',
                  }}
                >
                  New order
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-geist-mono), monospace',
                    fontSize: '1.7cqw',
                    color: '#a1a1aa',
                  }}
                >
                  just now
                </span>
              </div>
              <p
                style={{
                  margin: '1.6cqw 0 0',
                  fontWeight: '700',
                  fontSize: '2.4cqw',
                  color: '#f5f5f6',
                }}
              >
                Order #NC-10482 · Rahima Akter
              </p>
              <p
                style={{
                  margin: '0.3cqw 0 0',
                  fontSize: '1.9cqw',
                  color: '#c4c4cc',
                }}
              >
                Family pack, 2 × 500 g · ৳1,550 · Cash on delivery
              </p>
            </div>
            <div
              style={{
                position: 'absolute',
                left: '52cqw',
                top: '39cqw',
                width: '42cqw',
                boxSizing: 'border-box',
                background: '#16161a',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '3cqw',
                padding: '2.6cqw 2.8cqw',
                boxShadow: '0 4cqw 10cqw rgba(0, 0, 0, 0.5)',
                animation: 'ncom-f-hist 16s cubic-bezier(.2,.7,.2,1) infinite',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '1cqw',
                }}
              >
                <span
                  style={{
                    fontSize: '2cqw',
                    fontWeight: '700',
                    color: '#f5f5f6',
                  }}
                >
                  Delivery history
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-geist-mono), monospace',
                    fontSize: '1.6cqw',
                    color: '#a1a1aa',
                  }}
                >
                  STEADFAST
                </span>
              </div>
              <div
                aria-hidden="true"
                style={{
                  marginTop: '1.8cqw',
                  height: '1.2cqw',
                  borderRadius: '999px',
                  background: '#2a1f10',
                  overflow: 'hidden',
                }}
              >
                <span
                  style={{
                    display: 'block',
                    width: '95%',
                    height: '100%',
                    borderRadius: '999px',
                    background: '#4ade80',
                    transformOrigin: 'left',
                    animation:
                      'ncom-f-bar 16s cubic-bezier(.2,.7,.2,1) infinite',
                  }}
                ></span>
              </div>
              <div
                style={{
                  position: 'relative',
                  marginTop: '1.4cqw',
                  height: '3.4cqw',
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    left: '0',
                    top: '0',
                    fontSize: '1.9cqw',
                    color: '#c4c4cc',
                    opacity: '0',
                    animation: 'ncom-f-checking 16s infinite',
                  }}
                >
                  Checking this buyer’s parcels…
                </span>
                <span
                  style={{
                    position: 'absolute',
                    left: '0',
                    right: '0',
                    top: '0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '1cqw',
                    animation: 'ncom-f-result 16s infinite',
                  }}
                >
                  <span style={{ fontSize: '1.9cqw', color: '#c4c4cc' }}>
                    23 delivered · 2 refused
                  </span>
                  <span
                    style={{
                      background: 'rgba(74, 222, 128, 0.12)',
                      color: '#4ade80',
                      fontSize: '1.7cqw',
                      fontWeight: '800',
                      borderRadius: '999px',
                      padding: '0.3cqw 1.4cqw',
                    }}
                  >
                    Reliable
                  </span>
                </span>
              </div>
            </div>
            <div
              style={{
                position: 'absolute',
                left: '52cqw',
                top: '61cqw',
                width: '42cqw',
                boxSizing: 'border-box',
                background: '#16161a',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '3cqw',
                padding: '2.6cqw 2.8cqw',
                boxShadow: '0 4cqw 10cqw rgba(0, 0, 0, 0.5)',
                animation:
                  'ncom-f-courier 16s cubic-bezier(.2,.7,.2,1) infinite',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '1cqw',
                }}
              >
                <span
                  style={{
                    fontSize: '2cqw',
                    fontWeight: '700',
                    color: '#f5f5f6',
                  }}
                >
                  Booked with Steadfast
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-geist-mono), monospace',
                    fontSize: '1.6cqw',
                    color: '#a1a1aa',
                  }}
                >
                  YOUR ACCOUNT
                </span>
              </div>
              <div
                aria-hidden="true"
                style={{
                  position: 'relative',
                  marginTop: '2.2cqw',
                  height: '4cqw',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    left: '0',
                    right: '0',
                    top: '50%',
                    borderTop: '0.3cqw dashed #3a3a42',
                  }}
                ></div>
                <span
                  style={{
                    position: 'absolute',
                    right: '0',
                    top: '50%',
                    width: '1.4cqw',
                    height: '1.4cqw',
                    marginTop: '-0.7cqw',
                    borderRadius: '50%',
                    background: 'var(--accent)',
                  }}
                ></span>
                <span
                  style={{
                    position: 'absolute',
                    left: '0',
                    top: '0',
                    width: '6cqw',
                    height: '4cqw',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: '#16161a',
                    color: 'var(--accent)',
                    transform: 'translateX(30cqw)',
                    animation:
                      'ncom-f-truck 16s cubic-bezier(.45,0,.2,1) infinite',
                  }}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.9"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ width: '4.4cqw', height: '4.4cqw' }}
                  >
                    <path d="M3 6h11v10H3z"></path>
                    <path d="M14 9h4l3 3v4h-7"></path>
                    <circle cx="7" cy="17" r="1.8"></circle>
                    <circle cx="17" cy="17" r="1.8"></circle>
                  </svg>
                </span>
              </div>
              <p
                style={{
                  margin: '1.2cqw 0 0',
                  fontSize: '1.8cqw',
                  color: '#c4c4cc',
                }}
              >
                Consignment SF-128472913 · sticker printed
              </p>
            </div>
            <div
              style={{
                position: 'absolute',
                left: '52cqw',
                top: '83cqw',
                width: '42cqw',
                boxSizing: 'border-box',
                background: 'var(--accent)',
                color: '#0b0b0c',
                borderRadius: '3cqw',
                padding: '2.4cqw 2.8cqw',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '1.4cqw',
                animation: 'ncom-f-done 16s cubic-bezier(.2,.7,.2,1) infinite',
              }}
            >
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '1cqw',
                  fontWeight: '800',
                  fontSize: '2.3cqw',
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  style={{ width: '2.8cqw', height: '2.8cqw' }}
                >
                  <path d="M20 6 9 17l-5-5"></path>
                </svg>{' '}
                Delivered{' '}
              </span>
              <span
                style={{
                  fontSize: '2cqw',
                  fontWeight: '800',
                  whiteSpace: 'nowrap',
                }}
              >
                ৳1,550 collected
              </span>
            </div>
            <div
              aria-hidden="true"
              style={{
                position: 'absolute',
                left: '4.5cqw',
                right: '4.5cqw',
                bottom: '4cqw',
                height: '0.6cqw',
                borderRadius: '999px',
                background: 'rgba(255, 255, 255, 0.08)',
                overflow: 'hidden',
              }}
            >
              <span
                style={{
                  display: 'block',
                  height: '100%',
                  background: 'var(--accent)',
                  transformOrigin: 'left',
                  animation: 'ncom-f-progress 16s linear infinite',
                }}
              ></span>
            </div>
          </div>
        </div>
      </div>
      <div
        style={{
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        }}
      >
        <div
          style={{
            maxWidth: '1200px',
            margin: '0 auto',
            padding: '20px clamp(16px, 4vw, 40px)',
            boxSizing: 'border-box',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: '6px 32px',
          }}
        >
          <p
            style={{
              margin: '0',
              fontFamily:
                'var(--font-space-grotesk), var(--font-manrope), var(--font-bangla), sans-serif',
              fontSize: '17px',
              fontWeight: '500',
              color: '#e4e4e7',
            }}
          >
            Works with Steadfast · Pathao · Meta Pixel &amp; Conversions API ·
            Google Analytics 4
          </p>
          <p style={{ margin: '0', fontSize: '14px', color: '#c4c4cc' }}>
            Pixel, Conversions API and GA4 on every package
          </p>
        </div>
      </div>
    </section>
  )
}
