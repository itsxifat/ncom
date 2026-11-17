/** Questions and answers in the homepage FAQ's style: open/close rows. */
export function QuestionList({
  items,
}: {
  items: { q: string; a: React.ReactNode }[]
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {items.map((item, index) => (
        <details
          key={item.q}
          data-faq=""
          open={index < 2}
          style={{ borderBottom: '1px solid rgba(var(--s-ink), 0.08)' }}
        >
          <summary
            style={{
              cursor: 'pointer',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '16px',
              padding: '22px 0',
              fontSize: '18px',
              fontWeight: 700,
              minHeight: '44px',
            }}
          >
            {item.q}
            <span
              data-plus=""
              aria-hidden="true"
              style={{ color: 'var(--accent-text)', display: 'inline-flex' }}
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
                <path d="M12 5v14M5 12h14" />
              </svg>
            </span>
          </summary>
          <div
            style={{
              margin: '0 0 24px',
              maxWidth: '720px',
              fontSize: '16px',
              color: 'var(--s-muted)',
            }}
          >
            {item.a}
          </div>
        </details>
      ))}
    </div>
  )
}
