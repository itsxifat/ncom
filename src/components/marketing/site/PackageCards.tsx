'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  FEATURED_BADGE,
  FEATURED_CODE,
  cardLines,
  taka,
  yearlySaving,
  type PublicPackage,
} from './packages'

const HEADING_FONT = 'var(--font-space-grotesk), var(--font-bangla), sans-serif'

const CARD = {
  background: 'var(--s-card)',
  border: '1px solid rgba(var(--s-ink), 0.08)',
  borderRadius: '24px',
  padding: '26px',
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
  gap: '18px',
} as const

// The design's featured card: an accent sheen running round its border.
const FEATURED_CARD = {
  ...CARD,
  position: 'relative',
  background:
    'linear-gradient(var(--s-card), var(--s-card)) padding-box, linear-gradient(110deg, rgba(var(--s-ink), 0.1) 25%, var(--accent) 45%, rgba(var(--s-ink), 0.1) 65%) border-box',
  backgroundSize: '100% 100%, 300% 100%',
  border: '1px solid transparent',
  animation: 'ncom-border 5s linear infinite',
} as const

const BUTTON = {
  marginTop: 'auto',
  textAlign: 'center',
  textDecoration: 'none',
  fontWeight: 700,
  borderRadius: '12px',
  minHeight: '48px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 12px',
} as const

/**
 * The packages as cards, from the homepage design — prices, limits and trials
 * read live from the plans an admin keeps in /admin/plans.
 */
export function PackageCards({
  packages,
  showToggle = false,
}: {
  packages: PublicPackage[]
  /** The monthly/yearly switch (the pricing page); otherwise monthly with the yearly price beneath. */
  showToggle?: boolean
}) {
  const [yearly, setYearly] = useState(false)

  return (
    <div>
      {showToggle && (
        <div
          role="radiogroup"
          aria-label="Billing period"
          style={{
            display: 'flex',
            justifyContent: 'center',
            marginBottom: '32px',
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              padding: '4px',
              borderRadius: '999px',
              background: 'var(--s-raised)',
              border: '1px solid rgba(var(--s-ink), 0.08)',
            }}
          >
            {[
              { value: false, label: 'Monthly' },
              { value: true, label: 'Yearly · 1 month free' },
            ].map((option) => (
              <button
                key={option.label}
                type="button"
                role="radio"
                aria-checked={yearly === option.value}
                onClick={() => setYearly(option.value)}
                data-hover="btn"
                style={{
                  border: 0,
                  cursor: 'pointer',
                  borderRadius: '999px',
                  padding: '0 18px',
                  minHeight: '40px',
                  fontWeight: 700,
                  fontSize: '14px',
                  fontFamily: 'inherit',
                  background:
                    yearly === option.value ? 'var(--accent)' : 'transparent',
                  color: yearly === option.value ? '#0b0b0c' : 'var(--s-muted)',
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            'repeat(auto-fit, minmax(min(100%, 208px), 1fr))',
          gap: '14px',
          alignItems: 'stretch',
        }}
      >
        {packages.map((pkg) => {
          const featured = pkg.code === FEATURED_CODE
          const showYearly = yearly && pkg.annualPriceCents !== null
          const saving = yearlySaving(pkg)
          return (
            <article
              key={pkg.code}
              data-hover="lift"
              style={featured ? FEATURED_CARD : CARD}
            >
              {featured && (
                <span
                  style={{
                    position: 'absolute',
                    top: '-11px',
                    right: '18px',
                    background: 'var(--accent)',
                    color: '#0b0b0c',
                    fontSize: '11px',
                    fontWeight: 800,
                    borderRadius: '999px',
                    padding: '3px 10px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {FEATURED_BADGE}
                </span>
              )}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: '10px',
                }}
              >
                <div>
                  <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700 }}>
                    {pkg.name}
                  </h3>
                  {pkg.tagline && (
                    <p
                      style={{
                        margin: '4px 0 0',
                        fontSize: '13px',
                        lineHeight: 1.45,
                        color: 'var(--s-subtle)',
                      }}
                    >
                      {pkg.tagline}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <p
                  style={{
                    margin: 0,
                    fontFamily: HEADING_FONT,
                    fontSize: '40px',
                    fontWeight: 600,
                    letterSpacing: '-0.03em',
                    lineHeight: 1,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {taka(
                    showYearly ? pkg.annualPriceCents! : pkg.monthlyPriceCents
                  )}
                  <span
                    style={{
                      fontFamily: 'var(--font-manrope), sans-serif',
                      fontSize: '14px',
                      fontWeight: 600,
                      color: 'var(--s-subtle)',
                      letterSpacing: 0,
                    }}
                  >
                    {' '}
                    / {showYearly ? 'year' : 'month'}
                  </span>
                </p>
                {!showToggle && pkg.annualPriceCents && (
                  <p
                    style={{
                      margin: '8px 0 0',
                      fontSize: '13px',
                      color: 'var(--s-subtle)',
                    }}
                  >
                    or {taka(pkg.annualPriceCents)} a year
                    {saving ? ` — ${saving}` : ''}
                  </p>
                )}
                {showToggle && showYearly && saving && (
                  <p
                    style={{
                      margin: '8px 0 0',
                      fontSize: '13px',
                      color: 'var(--s-subtle)',
                    }}
                  >
                    {taka(Math.round(pkg.annualPriceCents! / 12))} a month —{' '}
                    {saving}
                  </p>
                )}
                <p
                  style={{
                    margin: '10px 0 0',
                    fontSize: '13px',
                    fontWeight: 700,
                    color:
                      pkg.trialDays > 0
                        ? 'var(--accent-text)'
                        : 'var(--s-subtle)',
                  }}
                >
                  {pkg.trialDays > 0
                    ? `${pkg.trialDays}-day free trial · no payment to start`
                    : 'Starts when you pay'}
                </p>
              </div>

              <ul
                style={{
                  margin: 0,
                  padding: 0,
                  listStyle: 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  fontSize: '14px',
                  color: 'var(--s-text-3)',
                }}
              >
                {cardLines(pkg).map((line) => (
                  <li key={line} style={{ display: 'flex', gap: '8px' }}>
                    <svg
                      viewBox="0 0 24 24"
                      width="16"
                      height="16"
                      fill="none"
                      stroke="var(--accent-text)"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                      style={{ flex: '0 0 auto', marginTop: '4px' }}
                    >
                      <path d="M5 12.5l4.5 4.5L19 7.5" />
                    </svg>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>

              <Link
                href="/register"
                data-hover={featured ? 'btn' : 'ghost'}
                style={
                  featured
                    ? {
                        ...BUTTON,
                        color: '#0b0b0c',
                        background: 'var(--accent)',
                        fontWeight: 800,
                      }
                    : {
                        ...BUTTON,
                        color: 'var(--s-text)',
                        border: '1px solid rgba(var(--s-ink), 0.16)',
                      }
                }
              >
                {pkg.trialDays > 0 ? 'Start free trial' : `Get ${pkg.name}`}
              </Link>
            </article>
          )
        })}
      </div>
    </div>
  )
}
