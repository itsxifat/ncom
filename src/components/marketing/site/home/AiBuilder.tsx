/**
 * Building with AI: describe the business, get an editable page.
 *
 * Ported from the NCOM homepage design (Claude Design canvas, Main.dc.html):
 * inline styles and data-hover hooks as designed; keyframes live in site.css.
 */
export function AiBuilder() {
  return (
    <section
      id="ai"
      aria-labelledby="ai-title"
      style={{
        maxWidth: '1200px',
        margin: '0 auto',
        padding: 'clamp(72px, 8vw, 116px) clamp(16px, 4vw, 40px)',
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
          AI builder
        </p>
        <h2
          id="ai-title"
          style={{
            textWrap: 'balance',
            margin: '16px 0 0',
            maxWidth: '780px',
            fontFamily:
              'var(--font-space-grotesk), var(--font-manrope), var(--font-bangla), sans-serif',
            fontWeight: '600',
            fontSize: 'clamp(36px, 4.8vw, 64px)',
            lineHeight: '1.02',
            letterSpacing: '-0.032em',
          }}
        >
          Describe your business. Get a page you can edit.
        </h2>
        <p
          style={{
            margin: '20px 0 0',
            maxWidth: '580px',
            fontSize: '18px',
            color: '#c4c4cc',
          }}
        >
          Write a few lines about what you sell, in Bangla or English, and get a
          complete page made of real blocks you can still drag, edit and
          restyle.
        </p>
      </div>
      <div
        style={{
          marginTop: '56px',
          display: 'grid',
          gridTemplateColumns:
            'repeat(auto-fit, minmax(min(100%, 320px), 1fr))',
          gap: '20px',
        }}
      >
        <article
          data-hover="lift"
          style={{
            background: '#111114',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '24px',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            animation: 'ncom-reveal linear both',
            animationTimeline: 'view()',
            animationRange: 'entry 0% cover 30%',
          }}
        >
          <div
            aria-hidden="true"
            style={{
              height: '220px',
              padding: '22px',
              boxSizing: 'border-box',
              background: '#0b0b0d',
              borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div
              style={{
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '12px',
                padding: '10px 12px',
                fontFamily: 'var(--font-bangla), sans-serif',
                fontSize: '14px',
                color: '#f5f5f6',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
              }}
            >
              <span
                style={{
                  display: 'inline-block',
                  animation: 'ncom-type 7s infinite',
                }}
              >
                অর্গানিক রোজমেরি হেয়ার অয়েল, ১০০ মিলি, ৬৫০ টাকা
              </span>
              <span
                style={{
                  display: 'inline-block',
                  width: '2px',
                  height: '16px',
                  marginLeft: '3px',
                  verticalAlign: '-3px',
                  background: 'var(--accent)',
                  animation: 'ncom-blink 1s steps(1) infinite',
                }}
              ></span>
            </div>
            <div
              style={{
                height: '52px',
                borderRadius: '10px',
                background: '#1f2a12',
                border: '1px solid #33451a',
                animation: 'ncom-step1 7s cubic-bezier(.2,.7,.2,1) infinite',
              }}
            ></div>
            <div
              style={{
                display: 'flex',
                gap: '8px',
                animation: 'ncom-step2 7s cubic-bezier(.2,.7,.2,1) infinite',
              }}
            >
              <div
                style={{
                  flex: '1',
                  height: '38px',
                  borderRadius: '10px',
                  background: '#18181c',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                }}
              ></div>
              <div
                style={{
                  flex: '1',
                  height: '38px',
                  borderRadius: '10px',
                  background: '#18181c',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                }}
              ></div>
              <div
                style={{
                  flex: '1',
                  height: '38px',
                  borderRadius: '10px',
                  background: '#18181c',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                }}
              ></div>
            </div>
            <div
              style={{
                height: '30px',
                borderRadius: '999px',
                background: 'var(--accent)',
                width: '46%',
                animation: 'ncom-step3 7s cubic-bezier(.2,.7,.2,1) infinite',
              }}
            ></div>
          </div>
          <div style={{ padding: '26px 28px 30px' }}>
            <p
              style={{
                margin: '0',
                display: 'inline-flex',
                alignItems: 'center',
                minHeight: '26px',
                padding: '0 12px',
                borderRadius: '999px',
                fontSize: '13px',
                fontWeight: '700',
                border: '1px solid var(--accent)',
                color: 'var(--accent)',
              }}
            >
              Uses AI credits
            </p>
            <h3
              style={{
                textWrap: 'balance',
                margin: '10px 0 0',
                fontFamily:
                  'var(--font-space-grotesk), var(--font-manrope), var(--font-bangla), sans-serif',
                fontWeight: '600',
                fontSize: '22px',
                letterSpacing: '-0.02em',
              }}
            >
              Build with AI
            </h3>
            <p
              style={{ margin: '8px 0 0', fontSize: '15px', color: '#c4c4cc' }}
            >
              A whole landing page or store from your description, ready to
              edit. Uses AI credits, on any package.
            </p>
          </div>
        </article>
        <article
          data-hover="lift"
          style={{
            background: '#111114',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '24px',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            animation: 'ncom-reveal linear both',
            animationTimeline: 'view()',
            animationRange: 'entry 5% cover 35%',
          }}
        >
          <div
            aria-hidden="true"
            style={{
              height: '220px',
              padding: '22px',
              boxSizing: 'border-box',
              background: '#0b0b0d',
              borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              fontSize: '13px',
            }}
          >
            <div
              style={{
                alignSelf: 'flex-end',
                maxWidth: '78%',
                background: '#1f1f24',
                borderRadius: '14px 14px 4px 14px',
                padding: '9px 12px',
                color: '#e4e4e7',
                animation: 'ncom-step1 7s cubic-bezier(.2,.7,.2,1) infinite',
              }}
            >
              Here’s NCOM’s prompt — design a store for my organic honey brand.
            </div>
            <div
              style={{
                alignSelf: 'flex-start',
                maxWidth: '82%',
                background: '#16161a',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '14px 14px 14px 4px',
                padding: '9px 12px',
                color: '#c4c4cc',
                fontFamily: 'var(--font-geist-mono), monospace',
                fontSize: '11px',
                animation: 'ncom-step2 7s cubic-bezier(.2,.7,.2,1) infinite',
              }}
            >
              {'{'} &quot;format&quot;: &quot;ncom/page@1&quot;, … {'}'}
            </div>
            <div
              style={{
                alignSelf: 'center',
                marginTop: 'auto',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                background: 'var(--accent)',
                color: '#0b0b0c',
                borderRadius: '999px',
                padding: '7px 14px',
                fontWeight: '800',
                animation: 'ncom-step3 7s cubic-bezier(.2,.7,.2,1) infinite',
              }}
            >
              <svg
                viewBox="0 0 24 24"
                width="14"
                height="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20 6 9 17l-5-5"></path>
              </svg>
              Pasted — your design is on the page
            </div>
          </div>
          <div style={{ padding: '26px 28px 30px' }}>
            <p
              style={{
                margin: '0',
                display: 'inline-flex',
                alignItems: 'center',
                minHeight: '26px',
                padding: '0 12px',
                borderRadius: '999px',
                fontSize: '13px',
                fontWeight: '700',
                background: 'var(--accent)',
                color: '#0b0b0c',
              }}
            >
              Free
            </p>
            <h3
              style={{
                textWrap: 'balance',
                margin: '10px 0 0',
                fontFamily:
                  'var(--font-space-grotesk), var(--font-manrope), var(--font-bangla), sans-serif',
                fontWeight: '600',
                fontSize: '22px',
                letterSpacing: '-0.02em',
              }}
            >
              Use your own AI
            </h3>
            <p
              style={{ margin: '8px 0 0', fontSize: '15px', color: '#c4c4cc' }}
            >
              Already pay for ChatGPT, Gemini or Claude? Copy our prompt into
              it, paste the answer back, and the design lands on your page.
            </p>
          </div>
        </article>
        <article
          data-hover="lift"
          style={{
            background: '#111114',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '24px',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            animation: 'ncom-reveal linear both',
            animationTimeline: 'view()',
            animationRange: 'entry 10% cover 40%',
          }}
        >
          <div
            aria-hidden="true"
            style={{
              height: '220px',
              padding: '18px 20px',
              boxSizing: 'border-box',
              background: '#0b0b0d',
              borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
              fontFamily: 'var(--font-geist-mono), monospace',
              fontSize: '12px',
              lineHeight: '1.75',
              color: '#a1a1aa',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
              <span
                style={{
                  width: '9px',
                  height: '9px',
                  borderRadius: '50%',
                  background: '#3f3f46',
                  display: 'inline-block',
                }}
              ></span>
              <span
                style={{
                  width: '9px',
                  height: '9px',
                  borderRadius: '50%',
                  background: '#3f3f46',
                  display: 'inline-block',
                }}
              ></span>
              <span
                style={{
                  width: '9px',
                  height: '9px',
                  borderRadius: '50%',
                  background: '#3f3f46',
                  display: 'inline-block',
                }}
              ></span>
            </div>
            <span>~/agency/clients</span>
            <span
              style={{
                color: '#e4e4e7',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
              }}
            >
              <span style={{ color: 'var(--accent)' }}>›</span>{' '}
              <span
                style={{
                  display: 'inline-block',
                  animation: 'ncom-type 7s infinite',
                }}
              >
                build a Bangla landing page for our rosemary hair oil
              </span>
            </span>
            <span style={{ animation: 'ncom-step2 7s infinite' }}>
              ● ncom.create_page · Bangla landing page
            </span>
            <span
              style={{ color: '#4ade80', animation: 'ncom-step3 7s infinite' }}
            >
              ✓ Draft saved — open it in the builder
            </span>
          </div>
          <div style={{ padding: '26px 28px 30px' }}>
            <p
              style={{
                margin: '0',
                display: 'inline-flex',
                alignItems: 'center',
                minHeight: '26px',
                padding: '0 12px',
                borderRadius: '999px',
                fontSize: '13px',
                fontWeight: '700',
                border: '1px solid var(--accent)',
                color: 'var(--accent)',
              }}
            >
              Drafts only
            </p>
            <h3
              style={{
                textWrap: 'balance',
                margin: '10px 0 0',
                fontFamily:
                  'var(--font-space-grotesk), var(--font-manrope), var(--font-bangla), sans-serif',
                fontWeight: '600',
                fontSize: '22px',
                letterSpacing: '-0.02em',
              }}
            >
              AI code editors
            </h3>
            <p
              style={{ margin: '8px 0 0', fontSize: '15px', color: '#c4c4cc' }}
            >
              Connect Cursor, Claude Code, VS Code or Windsurf and build pages
              in plain words. They arrive as drafts you publish.
            </p>
          </div>
        </article>
      </div>
    </section>
  )
}
