import { CONTAINER, HEADING_FONT } from './ui'

/**
 * A legal page in the site's style: a plain heading, the date it took effect,
 * and readable sections. Text is written for sellers, not lawyers.
 */
export function LegalPage({
  title,
  updated,
  intro,
  sections,
}: {
  title: string
  updated: string
  intro: React.ReactNode
  sections: { heading: string; body: React.ReactNode }[]
}) {
  return (
    <article
      style={{
        ...CONTAINER,
        maxWidth: '820px',
        padding:
          'clamp(64px, 8vw, 104px) clamp(16px, 4vw, 40px) clamp(72px, 8vw, 116px)',
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: '14px',
          fontWeight: 700,
          color: 'var(--accent)',
        }}
      >
        Legal
      </p>
      <h1
        style={{
          margin: '16px 0 0',
          fontFamily: HEADING_FONT,
          fontWeight: 600,
          fontSize: 'clamp(38px, 5vw, 60px)',
          lineHeight: 1.04,
          letterSpacing: '-0.03em',
        }}
      >
        {title}
      </h1>
      <p style={{ margin: '14px 0 0', fontSize: '14px', color: '#a1a1aa' }}>
        Last updated {updated}
      </p>
      <div
        className="ncom-legal"
        style={{
          marginTop: '36px',
          fontSize: '16px',
          lineHeight: 1.75,
          color: '#d4d4d8',
        }}
      >
        <div style={{ fontSize: '18px', color: '#e4e4e7' }}>{intro}</div>
        {sections.map((section, index) => (
          <section key={section.heading} style={{ marginTop: '40px' }}>
            <h2
              style={{
                margin: 0,
                fontFamily: HEADING_FONT,
                fontSize: '22px',
                fontWeight: 600,
                letterSpacing: '-0.01em',
                color: '#f5f5f6',
              }}
            >
              {index + 1}. {section.heading}
            </h2>
            <div style={{ marginTop: '12px' }}>{section.body}</div>
          </section>
        ))}
      </div>
    </article>
  )
}
