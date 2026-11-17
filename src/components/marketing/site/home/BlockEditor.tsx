/**
 * The editor: any block, styled separately for computer, tablet and phone.
 *
 * Ported from the NCOM homepage design (Claude Design canvas, Main.dc.html):
 * inline styles and data-hover hooks as designed; keyframes live in site.css.
 */
export function BlockEditor() {
  return (
    <section
      id="builder"
      aria-labelledby="builder-title"
      style={{
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
            maxWidth: '780px',
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
            The builder
          </p>
          <h2
            id="builder-title"
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
            Edit any block for computer, tablet and phone.
          </h2>
          <p
            style={{
              margin: '20px auto 0',
              maxWidth: '600px',
              fontSize: '18px',
              color: 'var(--s-muted)',
            }}
          >
            Drag in blocks that sell, then fine-tune any headline, button or
            photo for computer, tablet and phone. Nothing goes live until you
            press Publish.
          </p>
        </div>
        <div
          role="img"
          aria-label="The NCOM builder: a cursor selects the headline, makes it bigger, then switches the preview from computer to phone"
          style={{
            position: 'relative',
            marginTop: '64px',
            background: 'var(--s-card)',
            border: '1px solid rgba(var(--s-ink), 0.08)',
            borderRadius: '24px',
            overflow: 'hidden',
            boxShadow: 'var(--s-shadow-lg)',
            animation: 'ncom-rise 0.9s cubic-bezier(0.16, 1, 0.3, 1) both',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px',
              padding: '12px 16px',
              borderBottom: '1px solid rgba(var(--s-ink), 0.07)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                minWidth: '0',
              }}
            >
              <span
                style={{ color: 'var(--accent-text)', display: 'inline-flex' }}
              >
                <svg
                  viewBox="0 0 1180 238"
                  width="58"
                  height="12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="48"
                  strokeLinejoin="miter"
                  aria-hidden="true"
                >
                  <path d="M24 238V24H187A31 31 0 0 1 218 55V238"></path>
                  <path d="M495 24H341A31 31 0 0 0 310 55V183A31 31 0 0 0 341 214H495"></path>
                  <rect x="562" y="24" width="195" height="190" rx="31"></rect>
                  <path d="M848 238V24H1125A31 31 0 0 1 1156 55V238M1001 238V24"></path>
                </svg>
              </span>
              <span
                style={{
                  fontSize: '13px',
                  fontWeight: '700',
                  color: 'var(--s-text-3)',
                  whiteSpace: 'nowrap',
                }}
              >
                Madhuban Honey — Facebook ad
              </span>
            </div>
            <div
              style={{
                position: 'relative',
                display: 'flex',
                background: 'var(--s-raised)',
                border: '1px solid rgba(var(--s-ink), 0.07)',
                borderRadius: '10px',
                padding: '3px',
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  left: '3px',
                  top: '3px',
                  bottom: '3px',
                  width: 'calc((100% - 6px) / 3)',
                  background: 'var(--s-chrome)',
                  borderRadius: '7px',
                  animation:
                    'ncom-device 10s cubic-bezier(.65,0,.35,1) infinite',
                }}
              ></span>
              <span
                style={{
                  position: 'relative',
                  width: '76px',
                  textAlign: 'center',
                  fontSize: '12px',
                  padding: '4px 0',
                  color: 'var(--s-text-3)',
                }}
              >
                Computer
              </span>
              <span
                style={{
                  position: 'relative',
                  width: '76px',
                  textAlign: 'center',
                  fontSize: '12px',
                  padding: '4px 0',
                  color: 'var(--s-text-3)',
                }}
              >
                Tablet
              </span>
              <span
                style={{
                  position: 'relative',
                  width: '76px',
                  textAlign: 'center',
                  fontSize: '12px',
                  padding: '4px 0',
                  color: 'var(--s-text-3)',
                }}
              >
                Phone
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '12px', color: 'var(--s-subtle)' }}>
                Draft saved
              </span>
              <span
                style={{
                  background: 'var(--accent)',
                  color: '#0b0b0c',
                  fontWeight: '800',
                  fontSize: '13px',
                  padding: '6px 14px',
                  borderRadius: '999px',
                }}
              >
                Publish
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap' }}>
            <div
              style={{
                flex: '0 0 60px',
                borderRight: '1px solid rgba(var(--s-ink), 0.07)',
                padding: '14px 0',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '16px',
                fontSize: '10px',
                color: 'var(--s-subtle)',
              }}
            >
              <span
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="20"
                  height="20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 5v14M5 12h14"></path>
                </svg>
                Add
              </span>
              <span
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="20"
                  height="20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="m12 3 9 5-9 5-9-5 9-5Z"></path>
                  <path d="m3 13 9 5 9-5"></path>
                </svg>
                Layers
              </span>
              <span
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="20"
                  height="20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M7 3h7l5 5v13H7z"></path>
                  <path d="M14 3v5h5"></path>
                </svg>
                Pages
              </span>
              <span
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="20"
                  height="20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="8"></circle>
                  <path d="M12 4a8 8 0 0 0 0 16"></path>
                </svg>
                Design
              </span>
              <span
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '4px',
                  color: 'var(--accent-text)',
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="20"
                  height="20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 3l1.9 5.6L19.5 10.5 13.9 12.4 12 18l-1.9-5.6L4.5 10.5l5.6-1.9z"></path>
                </svg>
                AI
              </span>
            </div>
            <div
              style={{
                position: 'relative',
                flex: '1 1 240px',
                minWidth: '0',
                minHeight: '360px',
                background: 'var(--s-bg-alt)',
                padding: 'clamp(16px, 3vw, 36px)',
                boxSizing: 'border-box',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'flex-start',
              }}
            >
              <div
                style={{
                  width: '100%',
                  maxWidth: '560px',
                  background: '#fffaf0',
                  borderRadius: '16px',
                  overflow: 'hidden',
                  fontFamily: 'var(--font-bangla), sans-serif',
                  color: '#2b1d0e',
                  boxShadow: 'var(--s-shadow-md)',
                  animation:
                    'ncom-device-w 10s cubic-bezier(.65,0,.35,1) infinite',
                }}
              >
                <div
                  style={{
                    background: '#2b1d0e',
                    color: '#ffe9b8',
                    fontSize: '12px',
                    textAlign: 'center',
                    padding: '5px',
                  }}
                >
                  ঢাকার ভেতরে ফ্রি ডেলিভারি
                </div>
                <div style={{ padding: '44px 22px 26px' }}>
                  <div
                    style={{
                      position: 'relative',
                      display: 'inline-block',
                      maxWidth: '100%',
                    }}
                  >
                    <span
                      style={{
                        position: 'absolute',
                        inset: '-6px',
                        border: '2px solid var(--accent)',
                        borderRadius: '6px',
                        opacity: '0',
                        animation: 'ncom-select 10s infinite',
                      }}
                    ></span>
                    <span
                      style={{
                        position: 'absolute',
                        left: '-6px',
                        top: '-30px',
                        background: 'var(--accent)',
                        color: '#0b0b0c',
                        fontFamily: 'var(--font-manrope), sans-serif',
                        fontSize: '11px',
                        fontWeight: '800',
                        borderRadius: '6px',
                        padding: '1px 8px',
                        opacity: '0',
                        animation: 'ncom-select 10s infinite',
                      }}
                    >
                      Headline
                    </span>
                    <p
                      style={{
                        margin: '0',
                        fontSize: '24px',
                        lineHeight: '1.2',
                        fontWeight: '700',
                        animation:
                          'ncom-headline 10s cubic-bezier(.65,0,.35,1) infinite',
                      }}
                    >
                      সুন্দরবনের কাঁচা মধু
                    </p>
                  </div>
                  <p
                    style={{
                      margin: '12px 0 0',
                      fontSize: '14px',
                      color: '#6b5a45',
                    }}
                  >
                    ল্যাব-টেস্টেড, সরাসরি সুন্দরবনের মৌয়ালদের কাছ থেকে।
                  </p>
                  <div
                    style={{
                      marginTop: '16px',
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '10px',
                      alignItems: 'center',
                    }}
                  >
                    <span
                      style={{
                        background: '#a14a05',
                        color: '#ffffff',
                        borderRadius: '10px',
                        padding: '8px 18px',
                        fontSize: '14px',
                        fontWeight: '700',
                      }}
                    >
                      এখনই অর্ডার করুন
                    </span>
                    <span
                      style={{
                        fontSize: '16px',
                        fontWeight: '700',
                        color: '#a14a05',
                      }}
                    >
                      ৳৮৫০
                    </span>
                  </div>
                </div>
              </div>
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  left: '88%',
                  top: '78%',
                  width: '22px',
                  height: '22px',
                  animation:
                    'ncom-cursor 10s cubic-bezier(.65,0,.35,1) infinite',
                }}
              >
                <svg viewBox="0 0 24 24" width="22" height="22">
                  <path
                    d="M5 3l14 7.5-6 1.8L10.4 19z"
                    fill="var(--s-text)"
                    stroke="#0b0b0c"
                    strokeWidth="1.4"
                    strokeLinejoin="round"
                  ></path>
                </svg>
              </span>
            </div>
            <div
              style={{
                flex: '1 1 240px',
                minWidth: '0',
                borderLeft: '1px solid rgba(var(--s-ink), 0.07)',
                padding: '18px',
                boxSizing: 'border-box',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
                fontSize: '13px',
                color: 'var(--s-text-3)',
              }}
            >
              <p
                style={{
                  margin: '0',
                  fontWeight: '800',
                  fontSize: '14px',
                  color: 'var(--s-text)',
                }}
              >
                Headline
              </p>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '8px',
                  border: '1px solid rgba(var(--s-ink), 0.08)',
                  borderRadius: '10px',
                  padding: '9px 11px',
                }}
              >
                <span style={{ color: 'var(--s-subtle)' }}>Font</span>
                <span style={{ fontWeight: '700' }}>Hind Siliguri</span>
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '8px',
                }}
              >
                <div
                  style={{
                    border: '1px solid rgba(var(--s-ink), 0.08)',
                    borderRadius: '10px',
                    padding: '9px 11px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: '6px',
                  }}
                >
                  <span style={{ color: 'var(--s-subtle)' }}>Size</span>
                  <span
                    style={{
                      position: 'relative',
                      display: 'inline-block',
                      width: '22px',
                      textAlign: 'right',
                      fontWeight: '700',
                    }}
                  >
                    <span
                      style={{
                        position: 'absolute',
                        right: '0',
                        animation: 'ncom-val-a 10s infinite',
                      }}
                    >
                      24
                    </span>
                    <span
                      style={{
                        position: 'absolute',
                        right: '0',
                        color: 'var(--accent-text)',
                        opacity: '0',
                        animation: 'ncom-val-b 10s infinite',
                      }}
                    >
                      31
                    </span>{' '}
                  </span>
                </div>
                <div
                  style={{
                    border: '1px solid rgba(var(--s-ink), 0.08)',
                    borderRadius: '10px',
                    padding: '9px 11px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: '6px',
                  }}
                >
                  <span style={{ color: 'var(--s-subtle)' }}>Weight</span>
                  <span style={{ fontWeight: '700' }}>700</span>
                </div>
              </div>
              <div>
                <p style={{ margin: '0 0 8px', color: 'var(--s-subtle)' }}>
                  Colour
                </p>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <span
                    style={{
                      width: '26px',
                      height: '26px',
                      borderRadius: '8px',
                      background: '#2b1d0e',
                      outline: '2px solid var(--accent)',
                      outlineOffset: '2px',
                      display: 'inline-block',
                    }}
                  ></span>
                  <span
                    style={{
                      width: '26px',
                      height: '26px',
                      borderRadius: '8px',
                      background: '#a14a05',
                      display: 'inline-block',
                    }}
                  ></span>
                  <span
                    style={{
                      width: '26px',
                      height: '26px',
                      borderRadius: '8px',
                      background: '#e39a2f',
                      display: 'inline-block',
                    }}
                  ></span>
                  <span
                    style={{
                      width: '26px',
                      height: '26px',
                      borderRadius: '8px',
                      background: '#fffaf0',
                      display: 'inline-block',
                    }}
                  ></span>
                </div>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '8px',
                  border: '1px solid rgba(var(--s-ink), 0.08)',
                  borderRadius: '10px',
                  padding: '9px 11px',
                }}
              >
                <span style={{ color: 'var(--s-subtle)' }}>On scroll</span>
                <span style={{ fontWeight: '700' }}>Fade up</span>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '8px',
                  border: '1px solid rgba(var(--s-ink), 0.08)',
                  borderRadius: '10px',
                  padding: '9px 11px',
                }}
              >
                <span style={{ color: 'var(--s-subtle)' }}>On hover</span>
                <span style={{ fontWeight: '700' }}>Lift</span>
              </div>
            </div>
          </div>
        </div>
        <div
          style={{
            marginTop: '40px',
            display: 'grid',
            gridTemplateColumns:
              'repeat(auto-fit, minmax(min(100%, 330px), 1fr))',
            gap: '0 40px',
          }}
        >
          <p
            style={{
              margin: '0',
              padding: '20px 0',
              borderTop: '1px solid rgba(var(--s-ink), 0.08)',
              color: 'var(--s-muted)',
            }}
          >
            <strong style={{ color: 'var(--s-text)', fontWeight: '700' }}>
              Blocks that sell.
            </strong>{' '}
            Drag in a hero, an offer, an FAQ and the order form, then
            double-click any text to edit it.
          </p>
          <p
            style={{
              margin: '0',
              padding: '20px 0',
              borderTop: '1px solid rgba(var(--s-ink), 0.08)',
              color: 'var(--s-muted)',
            }}
          >
            <strong style={{ color: 'var(--s-text)', fontWeight: '700' }}>
              Bangla or English.
            </strong>{' '}
            Every word and button, with Bangla digits:{' '}
            <span
              lang="bn"
              style={{ fontFamily: 'var(--font-bangla), sans-serif' }}
            >
              ৳১,২৫০
            </span>
            .
          </p>
          <p
            style={{
              margin: '0',
              padding: '20px 0',
              borderTop: '1px solid rgba(var(--s-ink), 0.08)',
              color: 'var(--s-muted)',
            }}
          >
            <strong style={{ color: 'var(--s-text)', fontWeight: '700' }}>
              Real Bangla fonts.
            </strong>{' '}
            11 Bangla typefaces, plus any Google Font.
          </p>
          <p
            style={{
              margin: '0',
              padding: '20px 0',
              borderTop: '1px solid rgba(var(--s-ink), 0.08)',
              color: 'var(--s-muted)',
            }}
          >
            <strong style={{ color: 'var(--s-text)', fontWeight: '700' }}>
              Your web address.
            </strong>{' '}
            An NCOM address with SSL for every site. Your own domain from
            Starter.
          </p>
          <p
            style={{
              margin: '0',
              padding: '20px 0',
              borderTop: '1px solid rgba(var(--s-ink), 0.08)',
              color: 'var(--s-muted)',
            }}
          >
            <strong style={{ color: 'var(--s-text)', fontWeight: '700' }}>
              Offers.
            </strong>{' '}
            Combos, mix &amp; match, free gifts and discount codes.
          </p>
          <p
            style={{
              margin: '0',
              padding: '20px 0',
              borderTop: '1px solid rgba(var(--s-ink), 0.08)',
              color: 'var(--s-muted)',
            }}
          >
            <strong style={{ color: 'var(--s-text)', fontWeight: '700' }}>
              History.
            </strong>{' '}
            Drafts save on their own, and History puts an older version back.
          </p>
        </div>
      </div>
    </section>
  )
}
