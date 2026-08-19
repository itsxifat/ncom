import { Badge } from '@/components/ui/badge'

/**
 * Order status badges.
 *
 * Colour carries meaning here, so the mapping is centralised rather than
 * repeated per page: a merchant scanning an order list learns "lime = money
 * in, outline = nothing owed yet, red = needs attention" once. Getting that
 * inconsistent between the list and the detail view is how people misread
 * whether they have been paid.
 */

const FINANCIAL_VARIANT = {
  PENDING: 'outline',
  AUTHORIZED: 'secondary',
  PARTIALLY_PAID: 'secondary',
  PAID: 'lime',
  PARTIALLY_REFUNDED: 'secondary',
  REFUNDED: 'outline',
  VOIDED: 'destructive',
} as const

const FINANCIAL_LABEL = {
  PENDING: 'Payment pending',
  AUTHORIZED: 'Authorized',
  PARTIALLY_PAID: 'Partly paid',
  PAID: 'Paid',
  PARTIALLY_REFUNDED: 'Partly refunded',
  REFUNDED: 'Refunded',
  VOIDED: 'Voided',
} as const

export function FinancialStatusBadge({
  status,
}: {
  status: keyof typeof FINANCIAL_LABEL
}) {
  return (
    <Badge variant={FINANCIAL_VARIANT[status]}>{FINANCIAL_LABEL[status]}</Badge>
  )
}

const PRODUCT_VARIANT = {
  ACTIVE: 'lime',
  DRAFT: 'secondary',
  ARCHIVED: 'outline',
} as const

export function ProductStatusBadge({
  status,
}: {
  status: keyof typeof PRODUCT_VARIANT
}) {
  return (
    <Badge variant={PRODUCT_VARIANT[status]}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </Badge>
  )
}
