/**
 * What a visitor sees when the tenant behind a site is over their monthly
 * allowance.
 *
 * Written for the shopper, not the tenant: they did nothing wrong and cannot fix
 * it, so it says "temporarily unavailable, try later" and does not leak which
 * plan the site is on or how far over it went. The site owner learns the details
 * from their own dashboard and the usage alert email.
 *
 * Self-contained styles rather than the app's design tokens: this renders on a
 * tenant's domain in a route group that may not have loaded the workspace theme,
 * and a holding page that itself fails to style is worse than a plain one.
 */
export function AllowanceReachedPage({
  reason,
}: {
  reason: 'traffic' | 'visitors'
}) {
  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        background: '#fafaf9',
        color: '#1c1917',
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      }}
    >
      <div style={{ maxWidth: '30rem', textAlign: 'center' }}>
        <div
          aria-hidden="true"
          style={{
            width: '48px',
            height: '48px',
            margin: '0 auto 20px',
            borderRadius: '999px',
            background: '#0B3B2E',
            color: '#C9F24D',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '22px',
            fontWeight: 700,
          }}
        >
          !
        </div>
        <h1
          style={{
            margin: '0 0 12px',
            fontSize: '22px',
            lineHeight: 1.3,
            fontWeight: 600,
          }}
        >
          This site is temporarily unavailable
        </h1>
        <p style={{ margin: '0 0 8px', fontSize: '15px', color: '#57534e' }}>
          It has reached its monthly{' '}
          {reason === 'visitors' ? 'visitor' : 'bandwidth'} allowance and will be
          back at the start of next month.
        </p>
        <p style={{ margin: 0, fontSize: '13px', color: '#78716c' }}>
          If this is your site, sign in to your NCOM dashboard to restore it now.
        </p>
      </div>
    </main>
  )
}
