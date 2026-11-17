/**
 * Small pieces of the homepage design reused by the site's other pages, so a
 * pricing table or a legal page reads as part of the same site.
 */

export const HEADING_FONT =
  'var(--font-space-grotesk), var(--font-manrope), var(--font-bangla), sans-serif'

export const CONTAINER = {
  maxWidth: '1200px',
  margin: '0 auto',
  padding: '0 clamp(16px, 4vw, 40px)',
  boxSizing: 'border-box',
} as const

/** Eyebrow, headline and lead, as every section of the homepage opens. */
export function SectionIntro({
  eyebrow,
  title,
  lead,
  id,
  as = 'h2',
  align = 'center',
}: {
  eyebrow: string
  title: React.ReactNode
  lead?: React.ReactNode
  id?: string
  as?: 'h1' | 'h2'
  align?: 'center' | 'left'
}) {
  const Heading = as
  return (
    <div
      style={{
        textAlign: align,
        maxWidth: align === 'center' ? '780px' : '860px',
        margin: align === 'center' ? '0 auto' : 0,
        animation: 'ncom-rise 0.9s cubic-bezier(0.16, 1, 0.3, 1) both',
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
        {eyebrow}
      </p>
      <Heading
        id={id}
        style={{
          textWrap: 'balance',
          margin: '16px 0 0',
          fontFamily: HEADING_FONT,
          fontWeight: 600,
          fontSize:
            as === 'h1'
              ? 'clamp(40px, 5.4vw, 76px)'
              : 'clamp(36px, 4.8vw, 64px)',
          lineHeight: 1.02,
          letterSpacing: '-0.032em',
        }}
      >
        {title}
      </Heading>
      {lead && (
        <p
          style={{
            margin: align === 'center' ? '20px auto 0' : '20px 0 0',
            maxWidth: '620px',
            fontSize: '18px',
            color: '#c4c4cc',
          }}
        >
          {lead}
        </p>
      )}
    </div>
  )
}
