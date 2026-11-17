import Link from 'next/link'
import { HeroStage } from './HeroStage'
import { HeroGlobe } from './HeroGlobe'

/**
 * The opening of the homepage: the promise, the two ways in, and the product
 * doing its job — a page taking an order all the way to cash.
 *
 * The headline is the founder's line, set large and rising word by word; the
 * scene below is live (HeroStage), and behind it the Earth from orbit, close
 * over Bangladesh, with parcels arcing out from Dhaka (HeroGlobe). No blur or glow anywhere: crisp type and lines, and motion
 * that explains rather than decorates.
 */

const LINES: { words: string[]; accent?: boolean }[] = [
  { words: ['Make', 'a', 'landing', 'page'] },
  { words: ['or', 'an', 'online', 'store'] },
  { words: ['in', 'minutes.'], accent: true },
]

function Tick() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  )
}

export function Hero({ fromPrice }: { fromPrice: string }) {
  let index = 0
  return (
    <section id="top" aria-labelledby="hero-title" className="hx">
      <div className="hx-top">
        <div className="hx-inner">
          <Link
            href="/pricing"
            className="hx-pill hx-fade"
            style={{ ['--d' as string]: '0ms' }}
          >
            <b>New</b>
            Every package starts with 7 days free
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.25"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>

          <h1 id="hero-title" className="hx-title">
            {LINES.map((line, lineIndex) => (
              <span
                key={lineIndex}
                className={`hx-line${line.accent ? 'hx-accent-line' : ''}`}
              >
                {line.accent ? (
                  <span className="hx-accent">
                    {line.words.map((word, wordIndex) => (
                      <span key={word}>
                        <span className="hx-w">
                          <span style={{ ['--i' as string]: index++ }}>
                            {word}
                          </span>
                        </span>
                        {wordIndex < line.words.length - 1 ? ' ' : ''}
                      </span>
                    ))}
                    <svg
                      className="hx-underline"
                      viewBox="0 0 300 14"
                      preserveAspectRatio="none"
                      aria-hidden="true"
                    >
                      <path
                        d="M3 9 C 60 3, 140 3, 200 7 S 280 11, 297 5"
                        pathLength={1}
                      />
                    </svg>
                  </span>
                ) : (
                  line.words.map((word, wordIndex) => (
                    <span key={word}>
                      <span className="hx-w">
                        <span style={{ ['--i' as string]: index++ }}>
                          {word}
                        </span>
                      </span>
                      {wordIndex < line.words.length - 1 ? ' ' : ''}
                    </span>
                  ))
                )}
              </span>
            ))}
          </h1>

          <p className="hx-sub hx-fade" style={{ ['--d' as string]: '550ms' }}>
            Take cash-on-delivery orders in Bangla or English, stop fake orders
            before they ship, and book Steadfast or Pathao straight from the
            order. Built for Facebook sellers in Bangladesh.
          </p>

          <div
            className="hx-ctas hx-fade"
            style={{ ['--d' as string]: '700ms' }}
          >
            <Link href="/register" className="hx-btn hx-btn-primary">
              Start free trial
              <svg
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </Link>
            <a href="#flow" className="hx-btn hx-btn-ghost">
              See how an order moves
            </a>
          </div>

          <ul
            className="hx-proof hx-fade"
            style={{ ['--d' as string]: '850ms' }}
          >
            <li>
              <Tick />7 days free
            </li>
            <li>
              <Tick />
              No payment to start
            </li>
            <li>
              <Tick />
              From {fromPrice} a month
            </li>
            <li>
              <Tick />
              No cut of your sales
            </li>
          </ul>
        </div>
        <div
          className="hx-globe-wrap hx-fade"
          style={{ ['--d' as string]: '300ms' }}
        >
          <HeroGlobe />
        </div>
      </div>

      <div className="hx-stage-wrap">
        <HeroStage />
        <div
          className="hx-logos hx-fade"
          style={{ ['--d' as string]: '1200ms' }}
        >
          <p>Works with the services you already use</p>
          <span>Steadfast</span>
          <span>Pathao</span>
          <span>Meta Pixel</span>
          <span>Conversions API</span>
          <span>Google Analytics 4</span>
          <span>Google Tag Manager</span>
        </div>
      </div>
    </section>
  )
}
