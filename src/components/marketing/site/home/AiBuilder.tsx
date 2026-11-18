import Image from 'next/image'
import { SectionIntro } from '../ui'

/**
 * Building with AI, three ways — each card a complete little scene that plays
 * on a loop and never sits empty: a prompt becoming a page, a chat ending in a
 * pasted design, and a code editor saving a draft.
 *
 * The page the prompt makes is drawn as a real one — the product's photo
 * (Unsplash, free licence: photo-1669281393011-c335050cf0e9) and its Bangla
 * copy — not grey placeholder bars.
 */

function Badge({
  children,
  tone = 'accent',
}: {
  children: React.ReactNode
  tone?: 'accent' | 'outline'
}) {
  return (
    <span className="ai-badge" data-tone={tone}>
      {children}
    </span>
  )
}

export function AiBuilder() {
  return (
    <section id="ai" aria-labelledby="ai-title" className="ai">
      <SectionIntro
        id="ai-title"
        align="left"
        eyebrow="AI builder"
        title={
          <>
            Describe your business.
            <br />
            Get a page you can edit.
          </>
        }
        lead="Write a few lines about what you sell, in Bangla or English, and get a complete page made of real blocks you can still drag, edit and restyle."
      />

      <div className="ai-grid">
        {/* 1 — Build with AI */}
        <article
          className="ai-card"
          data-hover="lift"
          style={{
            animation: 'ncom-rise 0.9s cubic-bezier(0.16, 1, 0.3, 1) both',
          }}
        >
          <div className="ai-visual" aria-hidden="true">
            <div className="ai-prompt" lang="bn">
              <span className="ai-type">
                অর্গানিক রোজমেরি হেয়ার অয়েল, ১০০ মিলি, ৬৫০ টাকা
              </span>
              <i className="ai-caret" />
            </div>
            <div className="ai-page" lang="bn">
              <div className="ai-block ai-b1">
                <span className="ai-photo">
                  <Image
                    src="/marketing/showcase/hair-oil.jpg"
                    alt=""
                    width={80}
                    height={80}
                    sizes="36px"
                  />
                </span>
                <span className="ai-hero">
                  <b>অর্গানিক রোজমেরি হেয়ার অয়েল</b>
                  <span>
                    ১০০ মিলি · <strong>৳৬৫০</strong> <s>৳৮৫০</s>
                  </span>
                </span>
              </div>
              <div className="ai-block ai-b2">
                <span className="ai-pill">১ বোতল</span>
                <span className="ai-pill" data-on="">
                  ২ বোতল · ৳১,২০০
                </span>
                <span className="ai-pill">৩ বোতল</span>
              </div>
              <div className="ai-block ai-b3">
                <span className="ai-field">আপনার নাম</span>
                <span className="ai-field">মোবাইল</span>
                <span className="ai-cta">অর্ডার করুন</span>
              </div>
            </div>
            <span className="ai-status">
              <span className="ai-status-dot" />
              Generating · 3 blocks
            </span>
          </div>
          <div className="ai-copy">
            <Badge>Uses AI credits</Badge>
            <h3>Build with AI</h3>
            <p>
              A whole landing page or store from your description, ready to
              edit. Uses AI credits, on any package.
            </p>
          </div>
        </article>

        {/* 2 — Use your own AI */}
        <article
          className="ai-card"
          data-hover="lift"
          style={{
            animation: 'ncom-rise 0.9s cubic-bezier(0.16, 1, 0.3, 1) both',
          }}
        >
          <div className="ai-visual" aria-hidden="true">
            <div className="ai-chat">
              <div className="ai-bubble ai-me ai-s1">
                Here’s NCOM’s prompt — design a store for my organic honey
                brand.
              </div>
              <div className="ai-bubble ai-them ai-s2">
                <code>{'{ "format": "ncom/page@1",'}</code>
                <code>{'  "sections": [ hero, offer, form … ] }'}</code>
              </div>
              <div className="ai-pasted ai-s3">
                <svg
                  viewBox="0 0 24 24"
                  width="15"
                  height="15"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
                Pasted — your design is on the page
              </div>
            </div>
          </div>
          <div className="ai-copy">
            <Badge tone="outline">Free</Badge>
            <h3>Use your own AI</h3>
            <p>
              Already pay for ChatGPT, Gemini or Claude? Copy our prompt into
              it, paste the answer back, and the design lands on your page.
            </p>
          </div>
        </article>

        {/* 3 — AI code editors */}
        <article
          className="ai-card"
          data-hover="lift"
          style={{
            animation: 'ncom-rise 0.9s cubic-bezier(0.16, 1, 0.3, 1) both',
          }}
        >
          <div className="ai-visual ai-term" aria-hidden="true">
            <div className="ai-term-bar">
              <i />
              <i />
              <i />
              <span>~/agency/clients</span>
            </div>
            <p className="ai-t1">
              <span className="ai-prompt-sign">›</span> build a Bangla landing
              page for our rosemary hair oil
            </p>
            <p className="ai-t2 ai-dim">● ncom.get_design_guide · LANDING</p>
            <p className="ai-t3 ai-dim">
              ● ncom.create_site · Bangla landing page
            </p>
            <p className="ai-t4 ai-ok">
              ✓ Draft saved — open it in the builder
              <i className="ai-caret ai-caret-term" />
            </p>
          </div>
          <div className="ai-copy">
            <Badge tone="outline">Drafts only</Badge>
            <h3>AI code editors</h3>
            <p>
              Connect Cursor, Claude Code, VS Code or Windsurf and build pages
              in plain words. They arrive as drafts you publish.
            </p>
          </div>
        </article>
      </div>
    </section>
  )
}
