import { Badge } from '@/components/ui/badge'
import { TONE_STYLES } from '@/lib/order-status-colors'
import type { PageStatus } from '@/generated/prisma/enums'

/**
 * What a page's status means to the person whose page it is: can customers
 * see it or not. "Unpublished" was the platform describing an action; "Offline"
 * says what a visitor gets.
 */
const PAGE_STATUS = {
  PUBLISHED: { label: 'Live', tone: 'green' },
  DRAFT: { label: 'Draft', tone: 'none' },
  UNPUBLISHED: { label: 'Offline', tone: 'slate' },
} as const

export function PageStatusBadge({ status }: { status: PageStatus }) {
  const { label, tone } = PAGE_STATUS[status]
  return <Badge className={TONE_STYLES[tone].pill}>{label}</Badge>
}
