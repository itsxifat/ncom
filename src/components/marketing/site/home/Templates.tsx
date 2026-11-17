/**
 * The designs, in a marquee — each in English and Bangla.
 *
 * Ported from the NCOM homepage design (Claude Design canvas, Main.dc.html):
 * inline styles and data-hover hooks as designed; keyframes live in site.css.
 */
export function Templates() {
  return (
    <section
      id="templates"
      aria-labelledby="templates-title"
      style={{ padding: 'clamp(72px, 8vw, 116px) 0', overflow: 'hidden' }}
    >
      <div
        style={{
          maxWidth: '1200px',
          margin: '0 auto',
          padding: '0 clamp(16px, 4vw, 40px)',
          boxSizing: 'border-box',
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          gap: '20px 48px',
          animation: 'ncom-reveal linear both',
          animationTimeline: 'view()',
          animationRange: 'entry 0% cover 25%',
        }}
      >
        <div style={{ flex: '1 1 520px', minWidth: '0' }}>
          <p
            style={{
              margin: '0',
              fontSize: '14px',
              fontWeight: '700',
              color: 'var(--accent)',
            }}
          >
            Templates
          </p>
          <h2
            id="templates-title"
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
            8 designs, each in English and Bangla, on every package.
          </h2>
        </div>
        <p
          style={{
            margin: '0',
            flex: '0 1 360px',
            fontSize: '17px',
            color: '#c4c4cc',
          }}
        >
          Four landing pages and four stores, plus two blanks. Each one comes in
          English and Bangla, on every package.
        </p>
      </div>
      <div
        style={{
          marginTop: '56px',
          WebkitMaskImage:
            'linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent)',
          maskImage:
            'linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent)',
        }}
      >
        <div
          data-marquee=""
          style={{
            display: 'flex',
            width: 'max-content',
            gap: '20px',
            padding: '8px 20px 20px 0',
            animation: 'ncom-marquee 60s linear infinite',
          }}
        >
          <div style={{ width: '230px', flex: '0 0 auto' }}>
            <div
              style={{
                aspectRatio: '4 / 5',
                borderRadius: '16px',
                background: '#fff7f0',
                padding: '14px',
                boxSizing: 'border-box',
                display: 'flex',
                flexDirection: 'column',
                gap: '9px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <span
                  style={{
                    width: '18px',
                    height: '6px',
                    borderRadius: '3px',
                    background: '#e8590c',
                  }}
                ></span>
                <span
                  style={{
                    width: '26px',
                    height: '4px',
                    borderRadius: '2px',
                    background: 'color-mix(in srgb, #2b1606 10%, #fff7f0)',
                  }}
                ></span>
                <span
                  style={{
                    width: '20px',
                    height: '4px',
                    borderRadius: '2px',
                    background: 'color-mix(in srgb, #2b1606 10%, #fff7f0)',
                  }}
                ></span>
              </div>
              <p
                lang="bn"
                style={{
                  margin: '0',
                  fontFamily: 'var(--font-bangla), sans-serif',
                  letterSpacing: '0',
                  fontSize: '16px',
                  lineHeight: '1.3',
                  fontWeight: '700',
                  color: '#2b1606',
                }}
              >
                প্রিমিয়াম কটন পাঞ্জাবি, টেকে বহুদিন
              </p>
              <div
                style={{
                  flex: '1',
                  borderRadius: '10px',
                  background: 'color-mix(in srgb, #e8590c 16%, #fff7f0)',
                }}
              ></div>
              <p
                lang="bn"
                style={{
                  margin: '0',
                  fontFamily: 'var(--font-bangla), sans-serif',
                  letterSpacing: '0',
                  fontSize: '14px',
                  fontWeight: '700',
                  color: '#e8590c',
                }}
              >
                ৳১,৪৫০
              </p>
              <div
                style={{
                  minHeight: '30px',
                  borderRadius: '8px',
                  background: '#e8590c',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span
                  lang="bn"
                  style={{
                    fontFamily: 'var(--font-bangla), sans-serif',
                    letterSpacing: '0',
                    fontSize: '12px',
                    fontWeight: '700',
                    color: '#ffffff',
                  }}
                >
                  এখনই অর্ডার করুন
                </span>
              </div>
            </div>
            <p style={{ margin: '14px 0 0', fontWeight: '700' }}>Classic</p>
            <p style={{ margin: '0', fontSize: '13px', color: '#c4c4cc' }}>
              Landing page · any single product · English and Bangla
            </p>
          </div>
          <div style={{ width: '230px', flex: '0 0 auto' }}>
            <div
              style={{
                aspectRatio: '4 / 5',
                borderRadius: '16px',
                background: '#fff8f1',
                padding: '14px',
                boxSizing: 'border-box',
                display: 'flex',
                flexDirection: 'column',
                gap: '9px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <span
                  style={{
                    width: '18px',
                    height: '6px',
                    borderRadius: '3px',
                    background: '#e03131',
                  }}
                ></span>
                <span
                  style={{
                    width: '26px',
                    height: '4px',
                    borderRadius: '2px',
                    background: 'color-mix(in srgb, #3b0a0a 10%, #fff8f1)',
                  }}
                ></span>
                <span
                  style={{
                    width: '20px',
                    height: '4px',
                    borderRadius: '2px',
                    background: 'color-mix(in srgb, #3b0a0a 10%, #fff8f1)',
                  }}
                ></span>
              </div>
              <p
                lang="bn"
                style={{
                  margin: '0',
                  fontFamily: 'var(--font-bangla), sans-serif',
                  letterSpacing: '0',
                  fontSize: '16px',
                  lineHeight: '1.3',
                  fontWeight: '700',
                  color: '#3b0a0a',
                }}
              >
                অফার শেষ হতে বাকি
              </p>
              <div
                style={{
                  flex: '1',
                  borderRadius: '10px',
                  background: 'color-mix(in srgb, #e03131 16%, #fff8f1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span
                  lang="bn"
                  style={{
                    fontFamily: 'var(--font-bangla), sans-serif',
                    letterSpacing: '0',
                    fontSize: '21px',
                    fontWeight: '700',
                    color: '#e03131',
                  }}
                >
                  ০২ : ১৪ : ৫৯
                </span>
              </div>
              <div
                style={{
                  minHeight: '30px',
                  borderRadius: '8px',
                  background: '#e03131',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span
                  lang="bn"
                  style={{
                    fontFamily: 'var(--font-bangla), sans-serif',
                    letterSpacing: '0',
                    fontSize: '12px',
                    fontWeight: '700',
                    color: '#ffffff',
                  }}
                >
                  অফারটি নিন
                </span>
              </div>
            </div>
            <p style={{ margin: '14px 0 0', fontWeight: '700' }}>Flash sale</p>
            <p style={{ margin: '0', fontSize: '13px', color: '#c4c4cc' }}>
              Landing page · offers and drops · English and Bangla
            </p>
          </div>
          <div style={{ width: '230px', flex: '0 0 auto' }}>
            <div
              style={{
                aspectRatio: '4 / 5',
                borderRadius: '16px',
                background: '#fdf6f4',
                padding: '14px',
                boxSizing: 'border-box',
                display: 'flex',
                flexDirection: 'column',
                gap: '9px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <span
                  style={{
                    width: '18px',
                    height: '6px',
                    borderRadius: '3px',
                    background: '#c2577a',
                  }}
                ></span>
                <span
                  style={{
                    width: '26px',
                    height: '4px',
                    borderRadius: '2px',
                    background: 'color-mix(in srgb, #4a1f2d 10%, #fdf6f4)',
                  }}
                ></span>
                <span
                  style={{
                    width: '20px',
                    height: '4px',
                    borderRadius: '2px',
                    background: 'color-mix(in srgb, #4a1f2d 10%, #fdf6f4)',
                  }}
                ></span>
              </div>
              <p
                lang="bn"
                style={{
                  margin: '0',
                  fontFamily: 'var(--font-bangla), sans-serif',
                  letterSpacing: '0',
                  fontSize: '16px',
                  lineHeight: '1.3',
                  fontWeight: '700',
                  color: '#4a1f2d',
                }}
              >
                ১৪ দিনে উজ্জ্বল ত্বক
              </p>
              <div
                style={{
                  flex: '1',
                  borderRadius: '10px',
                  background: 'color-mix(in srgb, #c2577a 16%, #fdf6f4)',
                }}
              ></div>
              <p
                lang="bn"
                style={{
                  margin: '0',
                  fontFamily: 'var(--font-bangla), sans-serif',
                  letterSpacing: '0',
                  fontSize: '14px',
                  fontWeight: '700',
                  color: '#c2577a',
                }}
              >
                ৳৯৫০
              </p>
              <div
                style={{
                  minHeight: '30px',
                  borderRadius: '8px',
                  background: '#c2577a',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span
                  lang="bn"
                  style={{
                    fontFamily: 'var(--font-bangla), sans-serif',
                    letterSpacing: '0',
                    fontSize: '12px',
                    fontWeight: '700',
                    color: '#ffffff',
                  }}
                >
                  আজই আপনারটি নিন
                </span>
              </div>
            </div>
            <p style={{ margin: '14px 0 0', fontWeight: '700' }}>Glow</p>
            <p style={{ margin: '0', fontSize: '13px', color: '#c4c4cc' }}>
              Landing page · beauty and wellness · English and Bangla
            </p>
          </div>
          <div style={{ width: '230px', flex: '0 0 auto' }}>
            <div
              style={{
                aspectRatio: '4 / 5',
                borderRadius: '16px',
                background: '#0b0d12',
                padding: '14px',
                boxSizing: 'border-box',
                display: 'flex',
                flexDirection: 'column',
                gap: '9px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <span
                  style={{
                    width: '18px',
                    height: '6px',
                    borderRadius: '3px',
                    background: '#7c5cff',
                  }}
                ></span>
                <span
                  style={{
                    width: '26px',
                    height: '4px',
                    borderRadius: '2px',
                    background: 'color-mix(in srgb, #f4f2ff 10%, #0b0d12)',
                  }}
                ></span>
                <span
                  style={{
                    width: '20px',
                    height: '4px',
                    borderRadius: '2px',
                    background: 'color-mix(in srgb, #f4f2ff 10%, #0b0d12)',
                  }}
                ></span>
              </div>
              <p
                lang="bn"
                style={{
                  margin: '0',
                  fontFamily: 'var(--font-bangla), sans-serif',
                  letterSpacing: '0',
                  fontSize: '16px',
                  lineHeight: '1.3',
                  fontWeight: '700',
                  color: '#f4f2ff',
                }}
              >
                নয়েজ ক্যান্সেলিং ইয়ারবাড, ৪০ ঘণ্টা ব্যাটারি
              </p>
              <div
                style={{
                  flex: '1',
                  borderRadius: '10px',
                  background: 'color-mix(in srgb, #7c5cff 16%, #0b0d12)',
                }}
              ></div>
              <p
                lang="bn"
                style={{
                  margin: '0',
                  fontFamily: 'var(--font-bangla), sans-serif',
                  letterSpacing: '0',
                  fontSize: '14px',
                  fontWeight: '700',
                  color: '#7c5cff',
                }}
              >
                ৳২,৯৯০
              </p>
              <div
                style={{
                  minHeight: '30px',
                  borderRadius: '8px',
                  background: '#7c5cff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span
                  lang="bn"
                  style={{
                    fontFamily: 'var(--font-bangla), sans-serif',
                    letterSpacing: '0',
                    fontSize: '12px',
                    fontWeight: '700',
                    color: '#ffffff',
                  }}
                >
                  এখনই প্রি-অর্ডার করুন
                </span>
              </div>
            </div>
            <p style={{ margin: '14px 0 0', fontWeight: '700' }}>Launch</p>
            <p style={{ margin: '0', fontSize: '13px', color: '#c4c4cc' }}>
              Landing page · gadgets, pre-orders · English and Bangla
            </p>
          </div>
          <div style={{ width: '230px', flex: '0 0 auto' }}>
            <div
              style={{
                aspectRatio: '4 / 5',
                borderRadius: '16px',
                background: '#111111',
                padding: '14px',
                boxSizing: 'border-box',
                display: 'flex',
                flexDirection: 'column',
                gap: '9px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <span
                  style={{
                    width: '18px',
                    height: '6px',
                    borderRadius: '3px',
                    background: '#f59f00',
                  }}
                ></span>
                <span
                  style={{
                    width: '26px',
                    height: '4px',
                    borderRadius: '2px',
                    background: 'color-mix(in srgb, #ffffff 10%, #111111)',
                  }}
                ></span>
                <span
                  style={{
                    width: '20px',
                    height: '4px',
                    borderRadius: '2px',
                    background: 'color-mix(in srgb, #ffffff 10%, #111111)',
                  }}
                ></span>
              </div>
              <p
                lang="bn"
                style={{
                  margin: '0',
                  fontFamily: 'var(--font-bangla), sans-serif',
                  letterSpacing: '0',
                  fontSize: '16px',
                  lineHeight: '1.3',
                  fontWeight: '700',
                  color: '#ffffff',
                }}
              >
                আপনার যা দরকার, সব এক জায়গায়
              </p>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '6px',
                  flex: '1',
                }}
              >
                <div
                  style={{
                    borderRadius: '8px',
                    background: 'color-mix(in srgb, #f59f00 16%, #111111)',
                  }}
                ></div>
                <div
                  style={{
                    borderRadius: '8px',
                    background: 'color-mix(in srgb, #ffffff 10%, #111111)',
                  }}
                ></div>
                <div
                  style={{
                    borderRadius: '8px',
                    background: 'color-mix(in srgb, #ffffff 10%, #111111)',
                  }}
                ></div>
                <div
                  style={{
                    borderRadius: '8px',
                    background: 'color-mix(in srgb, #f59f00 16%, #111111)',
                  }}
                ></div>
              </div>
              <div
                style={{
                  minHeight: '30px',
                  borderRadius: '8px',
                  background: '#f59f00',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span
                  lang="bn"
                  style={{
                    fontFamily: 'var(--font-bangla), sans-serif',
                    letterSpacing: '0',
                    fontSize: '12px',
                    fontWeight: '700',
                    color: '#0b0b0c',
                  }}
                >
                  এখনই কিনুন
                </span>
              </div>
            </div>
            <p style={{ margin: '14px 0 0', fontWeight: '700' }}>Essentials</p>
            <p style={{ margin: '0', fontSize: '13px', color: '#c4c4cc' }}>
              Online store · lifestyle, gifts · English and Bangla
            </p>
          </div>
          <div style={{ width: '230px', flex: '0 0 auto' }}>
            <div
              style={{
                aspectRatio: '4 / 5',
                borderRadius: '16px',
                background: '#2b2118',
                padding: '14px',
                boxSizing: 'border-box',
                display: 'flex',
                flexDirection: 'column',
                gap: '9px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <span
                  style={{
                    width: '18px',
                    height: '6px',
                    borderRadius: '3px',
                    background: '#b08d57',
                  }}
                ></span>
                <span
                  style={{
                    width: '26px',
                    height: '4px',
                    borderRadius: '2px',
                    background: 'color-mix(in srgb, #f6efe6 10%, #2b2118)',
                  }}
                ></span>
                <span
                  style={{
                    width: '20px',
                    height: '4px',
                    borderRadius: '2px',
                    background: 'color-mix(in srgb, #f6efe6 10%, #2b2118)',
                  }}
                ></span>
              </div>
              <p
                lang="bn"
                style={{
                  margin: '0',
                  fontFamily: 'var(--font-bangla), sans-serif',
                  letterSpacing: '0',
                  fontSize: '16px',
                  lineHeight: '1.3',
                  fontWeight: '700',
                  color: '#f6efe6',
                }}
              >
                প্রতিদিনের জন্য স্নিগ্ধ আভিজাত্য
              </p>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '6px',
                  flex: '1',
                }}
              >
                <div
                  style={{
                    borderRadius: '8px',
                    background: 'color-mix(in srgb, #b08d57 16%, #2b2118)',
                  }}
                ></div>
                <div
                  style={{
                    borderRadius: '8px',
                    background: 'color-mix(in srgb, #f6efe6 10%, #2b2118)',
                  }}
                ></div>
                <div
                  style={{
                    borderRadius: '8px',
                    background: 'color-mix(in srgb, #f6efe6 10%, #2b2118)',
                  }}
                ></div>
                <div
                  style={{
                    borderRadius: '8px',
                    background: 'color-mix(in srgb, #b08d57 16%, #2b2118)',
                  }}
                ></div>
              </div>
              <div
                style={{
                  minHeight: '30px',
                  borderRadius: '8px',
                  background: '#b08d57',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span
                  lang="bn"
                  style={{
                    fontFamily: 'var(--font-bangla), sans-serif',
                    letterSpacing: '0',
                    fontSize: '12px',
                    fontWeight: '700',
                    color: '#0b0b0c',
                  }}
                >
                  কালেকশনটি দেখুন
                </span>
              </div>
            </div>
            <p style={{ margin: '14px 0 0', fontWeight: '700' }}>Boutique</p>
            <p style={{ margin: '0', fontSize: '13px', color: '#c4c4cc' }}>
              Online store · clothing, jewellery · English and Bangla
            </p>
          </div>
          <div style={{ width: '230px', flex: '0 0 auto' }}>
            <div
              style={{
                aspectRatio: '4 / 5',
                borderRadius: '16px',
                background: '#f6faf3',
                padding: '14px',
                boxSizing: 'border-box',
                display: 'flex',
                flexDirection: 'column',
                gap: '9px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <span
                  style={{
                    width: '18px',
                    height: '6px',
                    borderRadius: '3px',
                    background: '#2f7d32',
                  }}
                ></span>
                <span
                  style={{
                    width: '26px',
                    height: '4px',
                    borderRadius: '2px',
                    background: 'color-mix(in srgb, #173d19 10%, #f6faf3)',
                  }}
                ></span>
                <span
                  style={{
                    width: '20px',
                    height: '4px',
                    borderRadius: '2px',
                    background: 'color-mix(in srgb, #173d19 10%, #f6faf3)',
                  }}
                ></span>
              </div>
              <p
                lang="bn"
                style={{
                  margin: '0',
                  fontFamily: 'var(--font-bangla), sans-serif',
                  letterSpacing: '0',
                  fontSize: '16px',
                  lineHeight: '1.3',
                  fontWeight: '700',
                  color: '#173d19',
                }}
              >
                তাজা বাজার, আজই ডেলিভারি
              </p>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '6px',
                  flex: '1',
                }}
              >
                <div
                  style={{
                    borderRadius: '8px',
                    background: 'color-mix(in srgb, #2f7d32 16%, #f6faf3)',
                  }}
                ></div>
                <div
                  style={{
                    borderRadius: '8px',
                    background: 'color-mix(in srgb, #173d19 10%, #f6faf3)',
                  }}
                ></div>
                <div
                  style={{
                    borderRadius: '8px',
                    background: 'color-mix(in srgb, #173d19 10%, #f6faf3)',
                  }}
                ></div>
                <div
                  style={{
                    borderRadius: '8px',
                    background: 'color-mix(in srgb, #2f7d32 16%, #f6faf3)',
                  }}
                ></div>
              </div>
              <div
                style={{
                  minHeight: '30px',
                  borderRadius: '8px',
                  background: '#2f7d32',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span
                  lang="bn"
                  style={{
                    fontFamily: 'var(--font-bangla), sans-serif',
                    letterSpacing: '0',
                    fontSize: '12px',
                    fontWeight: '700',
                    color: '#ffffff',
                  }}
                >
                  এখনই কিনুন
                </span>
              </div>
            </div>
            <p style={{ margin: '14px 0 0', fontWeight: '700' }}>Fresh</p>
            <p style={{ margin: '0', fontSize: '13px', color: '#c4c4cc' }}>
              Online store · groceries, organic · English and Bangla
            </p>
          </div>
          <div style={{ width: '230px', flex: '0 0 auto' }}>
            <div
              style={{
                aspectRatio: '4 / 5',
                borderRadius: '16px',
                background: '#0d1015',
                padding: '14px',
                boxSizing: 'border-box',
                display: 'flex',
                flexDirection: 'column',
                gap: '9px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <span
                  style={{
                    width: '18px',
                    height: '6px',
                    borderRadius: '3px',
                    background: '#4f8cff',
                  }}
                ></span>
                <span
                  style={{
                    width: '26px',
                    height: '4px',
                    borderRadius: '2px',
                    background: 'color-mix(in srgb, #eef3ff 10%, #0d1015)',
                  }}
                ></span>
                <span
                  style={{
                    width: '20px',
                    height: '4px',
                    borderRadius: '2px',
                    background: 'color-mix(in srgb, #eef3ff 10%, #0d1015)',
                  }}
                ></span>
              </div>
              <p
                lang="bn"
                style={{
                  margin: '0',
                  fontFamily: 'var(--font-bangla), sans-serif',
                  letterSpacing: '0',
                  fontSize: '16px',
                  lineHeight: '1.3',
                  fontWeight: '700',
                  color: '#eef3ff',
                }}
              >
                সর্বশেষ প্রযুক্তি, সেরা দামে
              </p>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '6px',
                  flex: '1',
                }}
              >
                <div
                  style={{
                    borderRadius: '8px',
                    background: 'color-mix(in srgb, #4f8cff 16%, #0d1015)',
                  }}
                ></div>
                <div
                  style={{
                    borderRadius: '8px',
                    background: 'color-mix(in srgb, #eef3ff 10%, #0d1015)',
                  }}
                ></div>
                <div
                  style={{
                    borderRadius: '8px',
                    background: 'color-mix(in srgb, #eef3ff 10%, #0d1015)',
                  }}
                ></div>
                <div
                  style={{
                    borderRadius: '8px',
                    background: 'color-mix(in srgb, #4f8cff 16%, #0d1015)',
                  }}
                ></div>
              </div>
              <div
                style={{
                  minHeight: '30px',
                  borderRadius: '8px',
                  background: '#4f8cff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span
                  lang="bn"
                  style={{
                    fontFamily: 'var(--font-bangla), sans-serif',
                    letterSpacing: '0',
                    fontSize: '12px',
                    fontWeight: '700',
                    color: '#ffffff',
                  }}
                >
                  এখনই কিনুন
                </span>
              </div>
            </div>
            <p style={{ margin: '14px 0 0', fontWeight: '700' }}>Volt</p>
            <p style={{ margin: '0', fontSize: '13px', color: '#c4c4cc' }}>
              Online store · gadgets, electronics · English and Bangla
            </p>
          </div>
          <div aria-hidden="true" style={{ width: '230px', flex: '0 0 auto' }}>
            <div
              style={{
                aspectRatio: '4 / 5',
                borderRadius: '16px',
                background: '#fff7f0',
                padding: '14px',
                boxSizing: 'border-box',
                display: 'flex',
                flexDirection: 'column',
                gap: '9px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <span
                  style={{
                    width: '18px',
                    height: '6px',
                    borderRadius: '3px',
                    background: '#e8590c',
                  }}
                ></span>
                <span
                  style={{
                    width: '26px',
                    height: '4px',
                    borderRadius: '2px',
                    background: 'color-mix(in srgb, #2b1606 10%, #fff7f0)',
                  }}
                ></span>
                <span
                  style={{
                    width: '20px',
                    height: '4px',
                    borderRadius: '2px',
                    background: 'color-mix(in srgb, #2b1606 10%, #fff7f0)',
                  }}
                ></span>
              </div>
              <p
                lang="bn"
                style={{
                  margin: '0',
                  fontFamily: 'var(--font-bangla), sans-serif',
                  letterSpacing: '0',
                  fontSize: '16px',
                  lineHeight: '1.3',
                  fontWeight: '700',
                  color: '#2b1606',
                }}
              >
                প্রিমিয়াম কটন পাঞ্জাবি, টেকে বহুদিন
              </p>
              <div
                style={{
                  flex: '1',
                  borderRadius: '10px',
                  background: 'color-mix(in srgb, #e8590c 16%, #fff7f0)',
                }}
              ></div>
              <p
                lang="bn"
                style={{
                  margin: '0',
                  fontFamily: 'var(--font-bangla), sans-serif',
                  letterSpacing: '0',
                  fontSize: '14px',
                  fontWeight: '700',
                  color: '#e8590c',
                }}
              >
                ৳১,৪৫০
              </p>
              <div
                style={{
                  minHeight: '30px',
                  borderRadius: '8px',
                  background: '#e8590c',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span
                  lang="bn"
                  style={{
                    fontFamily: 'var(--font-bangla), sans-serif',
                    letterSpacing: '0',
                    fontSize: '12px',
                    fontWeight: '700',
                    color: '#ffffff',
                  }}
                >
                  এখনই অর্ডার করুন
                </span>
              </div>
            </div>
            <p style={{ margin: '14px 0 0', fontWeight: '700' }}>Classic</p>
            <p style={{ margin: '0', fontSize: '13px', color: '#c4c4cc' }}>
              Landing page · any single product · English and Bangla
            </p>
          </div>
          <div aria-hidden="true" style={{ width: '230px', flex: '0 0 auto' }}>
            <div
              style={{
                aspectRatio: '4 / 5',
                borderRadius: '16px',
                background: '#fff8f1',
                padding: '14px',
                boxSizing: 'border-box',
                display: 'flex',
                flexDirection: 'column',
                gap: '9px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <span
                  style={{
                    width: '18px',
                    height: '6px',
                    borderRadius: '3px',
                    background: '#e03131',
                  }}
                ></span>
                <span
                  style={{
                    width: '26px',
                    height: '4px',
                    borderRadius: '2px',
                    background: 'color-mix(in srgb, #3b0a0a 10%, #fff8f1)',
                  }}
                ></span>
                <span
                  style={{
                    width: '20px',
                    height: '4px',
                    borderRadius: '2px',
                    background: 'color-mix(in srgb, #3b0a0a 10%, #fff8f1)',
                  }}
                ></span>
              </div>
              <p
                lang="bn"
                style={{
                  margin: '0',
                  fontFamily: 'var(--font-bangla), sans-serif',
                  letterSpacing: '0',
                  fontSize: '16px',
                  lineHeight: '1.3',
                  fontWeight: '700',
                  color: '#3b0a0a',
                }}
              >
                অফার শেষ হতে বাকি
              </p>
              <div
                style={{
                  flex: '1',
                  borderRadius: '10px',
                  background: 'color-mix(in srgb, #e03131 16%, #fff8f1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span
                  lang="bn"
                  style={{
                    fontFamily: 'var(--font-bangla), sans-serif',
                    letterSpacing: '0',
                    fontSize: '21px',
                    fontWeight: '700',
                    color: '#e03131',
                  }}
                >
                  ০২ : ১৪ : ৫৯
                </span>
              </div>
              <div
                style={{
                  minHeight: '30px',
                  borderRadius: '8px',
                  background: '#e03131',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span
                  lang="bn"
                  style={{
                    fontFamily: 'var(--font-bangla), sans-serif',
                    letterSpacing: '0',
                    fontSize: '12px',
                    fontWeight: '700',
                    color: '#ffffff',
                  }}
                >
                  অফারটি নিন
                </span>
              </div>
            </div>
            <p style={{ margin: '14px 0 0', fontWeight: '700' }}>Flash sale</p>
            <p style={{ margin: '0', fontSize: '13px', color: '#c4c4cc' }}>
              Landing page · offers and drops · English and Bangla
            </p>
          </div>
          <div aria-hidden="true" style={{ width: '230px', flex: '0 0 auto' }}>
            <div
              style={{
                aspectRatio: '4 / 5',
                borderRadius: '16px',
                background: '#fdf6f4',
                padding: '14px',
                boxSizing: 'border-box',
                display: 'flex',
                flexDirection: 'column',
                gap: '9px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <span
                  style={{
                    width: '18px',
                    height: '6px',
                    borderRadius: '3px',
                    background: '#c2577a',
                  }}
                ></span>
                <span
                  style={{
                    width: '26px',
                    height: '4px',
                    borderRadius: '2px',
                    background: 'color-mix(in srgb, #4a1f2d 10%, #fdf6f4)',
                  }}
                ></span>
                <span
                  style={{
                    width: '20px',
                    height: '4px',
                    borderRadius: '2px',
                    background: 'color-mix(in srgb, #4a1f2d 10%, #fdf6f4)',
                  }}
                ></span>
              </div>
              <p
                lang="bn"
                style={{
                  margin: '0',
                  fontFamily: 'var(--font-bangla), sans-serif',
                  letterSpacing: '0',
                  fontSize: '16px',
                  lineHeight: '1.3',
                  fontWeight: '700',
                  color: '#4a1f2d',
                }}
              >
                ১৪ দিনে উজ্জ্বল ত্বক
              </p>
              <div
                style={{
                  flex: '1',
                  borderRadius: '10px',
                  background: 'color-mix(in srgb, #c2577a 16%, #fdf6f4)',
                }}
              ></div>
              <p
                lang="bn"
                style={{
                  margin: '0',
                  fontFamily: 'var(--font-bangla), sans-serif',
                  letterSpacing: '0',
                  fontSize: '14px',
                  fontWeight: '700',
                  color: '#c2577a',
                }}
              >
                ৳৯৫০
              </p>
              <div
                style={{
                  minHeight: '30px',
                  borderRadius: '8px',
                  background: '#c2577a',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span
                  lang="bn"
                  style={{
                    fontFamily: 'var(--font-bangla), sans-serif',
                    letterSpacing: '0',
                    fontSize: '12px',
                    fontWeight: '700',
                    color: '#ffffff',
                  }}
                >
                  আজই আপনারটি নিন
                </span>
              </div>
            </div>
            <p style={{ margin: '14px 0 0', fontWeight: '700' }}>Glow</p>
            <p style={{ margin: '0', fontSize: '13px', color: '#c4c4cc' }}>
              Landing page · beauty and wellness · English and Bangla
            </p>
          </div>
          <div aria-hidden="true" style={{ width: '230px', flex: '0 0 auto' }}>
            <div
              style={{
                aspectRatio: '4 / 5',
                borderRadius: '16px',
                background: '#0b0d12',
                padding: '14px',
                boxSizing: 'border-box',
                display: 'flex',
                flexDirection: 'column',
                gap: '9px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <span
                  style={{
                    width: '18px',
                    height: '6px',
                    borderRadius: '3px',
                    background: '#7c5cff',
                  }}
                ></span>
                <span
                  style={{
                    width: '26px',
                    height: '4px',
                    borderRadius: '2px',
                    background: 'color-mix(in srgb, #f4f2ff 10%, #0b0d12)',
                  }}
                ></span>
                <span
                  style={{
                    width: '20px',
                    height: '4px',
                    borderRadius: '2px',
                    background: 'color-mix(in srgb, #f4f2ff 10%, #0b0d12)',
                  }}
                ></span>
              </div>
              <p
                lang="bn"
                style={{
                  margin: '0',
                  fontFamily: 'var(--font-bangla), sans-serif',
                  letterSpacing: '0',
                  fontSize: '16px',
                  lineHeight: '1.3',
                  fontWeight: '700',
                  color: '#f4f2ff',
                }}
              >
                নয়েজ ক্যান্সেলিং ইয়ারবাড, ৪০ ঘণ্টা ব্যাটারি
              </p>
              <div
                style={{
                  flex: '1',
                  borderRadius: '10px',
                  background: 'color-mix(in srgb, #7c5cff 16%, #0b0d12)',
                }}
              ></div>
              <p
                lang="bn"
                style={{
                  margin: '0',
                  fontFamily: 'var(--font-bangla), sans-serif',
                  letterSpacing: '0',
                  fontSize: '14px',
                  fontWeight: '700',
                  color: '#7c5cff',
                }}
              >
                ৳২,৯৯০
              </p>
              <div
                style={{
                  minHeight: '30px',
                  borderRadius: '8px',
                  background: '#7c5cff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span
                  lang="bn"
                  style={{
                    fontFamily: 'var(--font-bangla), sans-serif',
                    letterSpacing: '0',
                    fontSize: '12px',
                    fontWeight: '700',
                    color: '#ffffff',
                  }}
                >
                  এখনই প্রি-অর্ডার করুন
                </span>
              </div>
            </div>
            <p style={{ margin: '14px 0 0', fontWeight: '700' }}>Launch</p>
            <p style={{ margin: '0', fontSize: '13px', color: '#c4c4cc' }}>
              Landing page · gadgets, pre-orders · English and Bangla
            </p>
          </div>
          <div aria-hidden="true" style={{ width: '230px', flex: '0 0 auto' }}>
            <div
              style={{
                aspectRatio: '4 / 5',
                borderRadius: '16px',
                background: '#111111',
                padding: '14px',
                boxSizing: 'border-box',
                display: 'flex',
                flexDirection: 'column',
                gap: '9px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <span
                  style={{
                    width: '18px',
                    height: '6px',
                    borderRadius: '3px',
                    background: '#f59f00',
                  }}
                ></span>
                <span
                  style={{
                    width: '26px',
                    height: '4px',
                    borderRadius: '2px',
                    background: 'color-mix(in srgb, #ffffff 10%, #111111)',
                  }}
                ></span>
                <span
                  style={{
                    width: '20px',
                    height: '4px',
                    borderRadius: '2px',
                    background: 'color-mix(in srgb, #ffffff 10%, #111111)',
                  }}
                ></span>
              </div>
              <p
                lang="bn"
                style={{
                  margin: '0',
                  fontFamily: 'var(--font-bangla), sans-serif',
                  letterSpacing: '0',
                  fontSize: '16px',
                  lineHeight: '1.3',
                  fontWeight: '700',
                  color: '#ffffff',
                }}
              >
                আপনার যা দরকার, সব এক জায়গায়
              </p>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '6px',
                  flex: '1',
                }}
              >
                <div
                  style={{
                    borderRadius: '8px',
                    background: 'color-mix(in srgb, #f59f00 16%, #111111)',
                  }}
                ></div>
                <div
                  style={{
                    borderRadius: '8px',
                    background: 'color-mix(in srgb, #ffffff 10%, #111111)',
                  }}
                ></div>
                <div
                  style={{
                    borderRadius: '8px',
                    background: 'color-mix(in srgb, #ffffff 10%, #111111)',
                  }}
                ></div>
                <div
                  style={{
                    borderRadius: '8px',
                    background: 'color-mix(in srgb, #f59f00 16%, #111111)',
                  }}
                ></div>
              </div>
              <div
                style={{
                  minHeight: '30px',
                  borderRadius: '8px',
                  background: '#f59f00',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span
                  lang="bn"
                  style={{
                    fontFamily: 'var(--font-bangla), sans-serif',
                    letterSpacing: '0',
                    fontSize: '12px',
                    fontWeight: '700',
                    color: '#0b0b0c',
                  }}
                >
                  এখনই কিনুন
                </span>
              </div>
            </div>
            <p style={{ margin: '14px 0 0', fontWeight: '700' }}>Essentials</p>
            <p style={{ margin: '0', fontSize: '13px', color: '#c4c4cc' }}>
              Online store · lifestyle, gifts · English and Bangla
            </p>
          </div>
          <div aria-hidden="true" style={{ width: '230px', flex: '0 0 auto' }}>
            <div
              style={{
                aspectRatio: '4 / 5',
                borderRadius: '16px',
                background: '#2b2118',
                padding: '14px',
                boxSizing: 'border-box',
                display: 'flex',
                flexDirection: 'column',
                gap: '9px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <span
                  style={{
                    width: '18px',
                    height: '6px',
                    borderRadius: '3px',
                    background: '#b08d57',
                  }}
                ></span>
                <span
                  style={{
                    width: '26px',
                    height: '4px',
                    borderRadius: '2px',
                    background: 'color-mix(in srgb, #f6efe6 10%, #2b2118)',
                  }}
                ></span>
                <span
                  style={{
                    width: '20px',
                    height: '4px',
                    borderRadius: '2px',
                    background: 'color-mix(in srgb, #f6efe6 10%, #2b2118)',
                  }}
                ></span>
              </div>
              <p
                lang="bn"
                style={{
                  margin: '0',
                  fontFamily: 'var(--font-bangla), sans-serif',
                  letterSpacing: '0',
                  fontSize: '16px',
                  lineHeight: '1.3',
                  fontWeight: '700',
                  color: '#f6efe6',
                }}
              >
                প্রতিদিনের জন্য স্নিগ্ধ আভিজাত্য
              </p>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '6px',
                  flex: '1',
                }}
              >
                <div
                  style={{
                    borderRadius: '8px',
                    background: 'color-mix(in srgb, #b08d57 16%, #2b2118)',
                  }}
                ></div>
                <div
                  style={{
                    borderRadius: '8px',
                    background: 'color-mix(in srgb, #f6efe6 10%, #2b2118)',
                  }}
                ></div>
                <div
                  style={{
                    borderRadius: '8px',
                    background: 'color-mix(in srgb, #f6efe6 10%, #2b2118)',
                  }}
                ></div>
                <div
                  style={{
                    borderRadius: '8px',
                    background: 'color-mix(in srgb, #b08d57 16%, #2b2118)',
                  }}
                ></div>
              </div>
              <div
                style={{
                  minHeight: '30px',
                  borderRadius: '8px',
                  background: '#b08d57',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span
                  lang="bn"
                  style={{
                    fontFamily: 'var(--font-bangla), sans-serif',
                    letterSpacing: '0',
                    fontSize: '12px',
                    fontWeight: '700',
                    color: '#0b0b0c',
                  }}
                >
                  কালেকশনটি দেখুন
                </span>
              </div>
            </div>
            <p style={{ margin: '14px 0 0', fontWeight: '700' }}>Boutique</p>
            <p style={{ margin: '0', fontSize: '13px', color: '#c4c4cc' }}>
              Online store · clothing, jewellery · English and Bangla
            </p>
          </div>
          <div aria-hidden="true" style={{ width: '230px', flex: '0 0 auto' }}>
            <div
              style={{
                aspectRatio: '4 / 5',
                borderRadius: '16px',
                background: '#f6faf3',
                padding: '14px',
                boxSizing: 'border-box',
                display: 'flex',
                flexDirection: 'column',
                gap: '9px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <span
                  style={{
                    width: '18px',
                    height: '6px',
                    borderRadius: '3px',
                    background: '#2f7d32',
                  }}
                ></span>
                <span
                  style={{
                    width: '26px',
                    height: '4px',
                    borderRadius: '2px',
                    background: 'color-mix(in srgb, #173d19 10%, #f6faf3)',
                  }}
                ></span>
                <span
                  style={{
                    width: '20px',
                    height: '4px',
                    borderRadius: '2px',
                    background: 'color-mix(in srgb, #173d19 10%, #f6faf3)',
                  }}
                ></span>
              </div>
              <p
                lang="bn"
                style={{
                  margin: '0',
                  fontFamily: 'var(--font-bangla), sans-serif',
                  letterSpacing: '0',
                  fontSize: '16px',
                  lineHeight: '1.3',
                  fontWeight: '700',
                  color: '#173d19',
                }}
              >
                তাজা বাজার, আজই ডেলিভারি
              </p>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '6px',
                  flex: '1',
                }}
              >
                <div
                  style={{
                    borderRadius: '8px',
                    background: 'color-mix(in srgb, #2f7d32 16%, #f6faf3)',
                  }}
                ></div>
                <div
                  style={{
                    borderRadius: '8px',
                    background: 'color-mix(in srgb, #173d19 10%, #f6faf3)',
                  }}
                ></div>
                <div
                  style={{
                    borderRadius: '8px',
                    background: 'color-mix(in srgb, #173d19 10%, #f6faf3)',
                  }}
                ></div>
                <div
                  style={{
                    borderRadius: '8px',
                    background: 'color-mix(in srgb, #2f7d32 16%, #f6faf3)',
                  }}
                ></div>
              </div>
              <div
                style={{
                  minHeight: '30px',
                  borderRadius: '8px',
                  background: '#2f7d32',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span
                  lang="bn"
                  style={{
                    fontFamily: 'var(--font-bangla), sans-serif',
                    letterSpacing: '0',
                    fontSize: '12px',
                    fontWeight: '700',
                    color: '#ffffff',
                  }}
                >
                  এখনই কিনুন
                </span>
              </div>
            </div>
            <p style={{ margin: '14px 0 0', fontWeight: '700' }}>Fresh</p>
            <p style={{ margin: '0', fontSize: '13px', color: '#c4c4cc' }}>
              Online store · groceries, organic · English and Bangla
            </p>
          </div>
          <div aria-hidden="true" style={{ width: '230px', flex: '0 0 auto' }}>
            <div
              style={{
                aspectRatio: '4 / 5',
                borderRadius: '16px',
                background: '#0d1015',
                padding: '14px',
                boxSizing: 'border-box',
                display: 'flex',
                flexDirection: 'column',
                gap: '9px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <span
                  style={{
                    width: '18px',
                    height: '6px',
                    borderRadius: '3px',
                    background: '#4f8cff',
                  }}
                ></span>
                <span
                  style={{
                    width: '26px',
                    height: '4px',
                    borderRadius: '2px',
                    background: 'color-mix(in srgb, #eef3ff 10%, #0d1015)',
                  }}
                ></span>
                <span
                  style={{
                    width: '20px',
                    height: '4px',
                    borderRadius: '2px',
                    background: 'color-mix(in srgb, #eef3ff 10%, #0d1015)',
                  }}
                ></span>
              </div>
              <p
                lang="bn"
                style={{
                  margin: '0',
                  fontFamily: 'var(--font-bangla), sans-serif',
                  letterSpacing: '0',
                  fontSize: '16px',
                  lineHeight: '1.3',
                  fontWeight: '700',
                  color: '#eef3ff',
                }}
              >
                সর্বশেষ প্রযুক্তি, সেরা দামে
              </p>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '6px',
                  flex: '1',
                }}
              >
                <div
                  style={{
                    borderRadius: '8px',
                    background: 'color-mix(in srgb, #4f8cff 16%, #0d1015)',
                  }}
                ></div>
                <div
                  style={{
                    borderRadius: '8px',
                    background: 'color-mix(in srgb, #eef3ff 10%, #0d1015)',
                  }}
                ></div>
                <div
                  style={{
                    borderRadius: '8px',
                    background: 'color-mix(in srgb, #eef3ff 10%, #0d1015)',
                  }}
                ></div>
                <div
                  style={{
                    borderRadius: '8px',
                    background: 'color-mix(in srgb, #4f8cff 16%, #0d1015)',
                  }}
                ></div>
              </div>
              <div
                style={{
                  minHeight: '30px',
                  borderRadius: '8px',
                  background: '#4f8cff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span
                  lang="bn"
                  style={{
                    fontFamily: 'var(--font-bangla), sans-serif',
                    letterSpacing: '0',
                    fontSize: '12px',
                    fontWeight: '700',
                    color: '#ffffff',
                  }}
                >
                  এখনই কিনুন
                </span>
              </div>
            </div>
            <p style={{ margin: '14px 0 0', fontWeight: '700' }}>Volt</p>
            <p style={{ margin: '0', fontSize: '13px', color: '#c4c4cc' }}>
              Online store · gadgets, electronics · English and Bangla
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
