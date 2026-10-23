/**
 * Small marks for the social networks a footer links to.
 *
 * lucide no longer ships brand marks, and a row of identical globes tells a
 * shopper nothing about which one is Facebook. These are drawn in lucide's own
 * stroke style — 24-unit grid, two-unit round strokes, `currentColor` — so
 * they sit with every other icon on the page and take the colour a merchant
 * gives the footer.
 */

export const SOCIAL_NETWORKS = [
  'facebook',
  'instagram',
  'youtube',
  'tiktok',
  'whatsapp',
  'x',
] as const

export type SocialNetwork = (typeof SOCIAL_NETWORKS)[number]

export const SOCIAL_LABELS: Record<SocialNetwork, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  youtube: 'YouTube',
  tiktok: 'TikTok',
  whatsapp: 'WhatsApp',
  x: 'X',
}

const MARKS: Record<SocialNetwork, React.ReactNode> = {
  facebook: (
    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
  ),
  instagram: (
    <>
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  youtube: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="4" />
      <path d="m10 9 5 3-5 3z" />
    </>
  ),
  tiktok: (
    <path d="M21 7.9V12a9.9 9.9 0 0 1-5-1.9v4.4A6.5 6.5 0 1 1 8 8.2v4.3a2.5 2.5 0 1 0 4 2V3h4.1A6 6 0 0 0 21 7.9z" />
  ),
  whatsapp: (
    <>
      <path d="m3 21 1.65-3.8a9 9 0 1 1 3.4 2.9L3 21" />
      <path d="M9 10a.5.5 0 0 0 1 0V9a.5.5 0 0 0-1 0v1a5 5 0 0 0 5 5h1a.5.5 0 0 0 0-1h-1a.5.5 0 0 0 0 1" />
    </>
  ),
  x: (
    <>
      <path d="M4 4l11.7 16H20L8.3 4z" />
      <path d="M4 20l6.8-6.8M13.2 10.8 20 4" />
    </>
  ),
}

export function SocialGlyph({
  network,
  className,
}: {
  network: SocialNetwork
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      {MARKS[network]}
    </svg>
  )
}

/**
 * Where a social entry goes, from whatever the merchant pasted.
 *
 * Merchants paste what they have: "facebook.com/myshop" without the https, or
 * for WhatsApp just their phone number. A WhatsApp number becomes a wa.me link,
 * and a Bangladeshi number written the local way (01…) gets its country code,
 * because wa.me will not open a chat without one and the merchant should not
 * have to know that.
 */
export function socialHref(network: SocialNetwork, raw: string): string | null {
  const value = raw.trim()
  if (!value) return null

  if (network === 'whatsapp' && !/^https?:\/\//i.test(value)) {
    let digits = value.replace(/\D/g, '')
    if (digits.length === 11 && digits.startsWith('0')) digits = `88${digits}`
    return digits.length >= 8 ? `https://wa.me/${digits}` : null
  }

  return /^https?:\/\//i.test(value) ? value : `https://${value}`
}
