import { COMPARISON, taka, type PublicPackage } from './packages'
import { HEADING_FONT } from './ui'

const CELL = {
  padding: '14px 16px',
  borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
  textAlign: 'center',
  fontSize: '14px',
  color: '#d4d4d8',
  whiteSpace: 'nowrap',
} as const

function Value({ value }: { value: string | boolean }) {
  if (value === true) {
    return (
      <svg
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        role="img"
        aria-label="Included"
      >
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    )
  }
  if (value === false) {
    return (
      <span aria-label="Not included" style={{ color: '#52525b' }}>
        —
      </span>
    )
  }
  return <>{value}</>
}

/** Every limit and feature, package by package — read from /admin/plans. */
export function ComparisonTable({ packages }: { packages: PublicPackage[] }) {
  return (
    <div
      style={{
        overflowX: 'auto',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '24px',
        background: '#0e0e11',
      }}
    >
      <table
        style={{
          width: '100%',
          minWidth: '880px',
          borderCollapse: 'collapse',
        }}
      >
        <caption style={{ position: 'absolute', left: '-9999px' }}>
          Every NCOM package compared
        </caption>
        <thead>
          <tr>
            <th
              scope="col"
              style={{
                ...CELL,
                textAlign: 'left',
                color: '#a1a1aa',
                fontWeight: 600,
              }}
            >
              Package
            </th>
            {packages.map((pkg) => (
              <th
                key={pkg.code}
                scope="col"
                style={{ ...CELL, verticalAlign: 'bottom' }}
              >
                <span
                  style={{
                    display: 'block',
                    fontSize: '16px',
                    fontWeight: 700,
                    color: '#f5f5f6',
                  }}
                >
                  {pkg.name}
                </span>
                <span
                  style={{
                    display: 'block',
                    marginTop: '4px',
                    fontFamily: HEADING_FONT,
                    fontSize: '22px',
                    fontWeight: 600,
                    color: '#f5f5f6',
                  }}
                >
                  {taka(pkg.monthlyPriceCents)}
                  <span style={{ fontSize: '12px', color: '#a1a1aa' }}>
                    /mo
                  </span>
                </span>
                <span
                  style={{
                    display: 'block',
                    marginTop: '4px',
                    fontSize: '12px',
                    color: pkg.trialDays > 0 ? 'var(--accent)' : '#71717a',
                  }}
                >
                  {pkg.trialDays > 0
                    ? `${pkg.trialDays}-day free trial`
                    : 'No trial'}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        {COMPARISON.map((group) => (
          <tbody key={group.group}>
            <tr>
              <th
                scope="colgroup"
                colSpan={packages.length + 1}
                style={{
                  ...CELL,
                  textAlign: 'left',
                  paddingTop: '26px',
                  color: 'var(--accent)',
                  fontSize: '13px',
                  fontWeight: 700,
                  letterSpacing: '0.02em',
                  textTransform: 'uppercase',
                }}
              >
                {group.group}
              </th>
            </tr>
            {group.rows.map((row) => (
              <tr key={row.label}>
                <th
                  scope="row"
                  style={{
                    ...CELL,
                    textAlign: 'left',
                    fontWeight: 500,
                    color: '#e4e4e7',
                    whiteSpace: 'normal',
                  }}
                >
                  {row.label}
                </th>
                {packages.map((pkg) => (
                  <td key={pkg.code} style={CELL}>
                    <Value value={row.value(pkg)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  )
}
