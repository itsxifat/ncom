'use client'

import { useActionState } from 'react'
import { CreditCard, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FieldError } from '@/components/ui/field'
import { payBillAction } from './actions'

/**
 * Pays the workspace's bill on Enfinito Pay. The bill is raised on the server
 * if it does not exist yet, so this works from the first day of a trial, not
 * only once the reminder has gone out.
 */
export function PayBillButton({
  label,
  variant = 'default',
}: {
  label: string
  variant?: 'default' | 'outline'
}) {
  const [state, formAction, pending] = useActionState(
    async () => payBillAction(),
    undefined
  )
  return (
    <form action={formAction} className="flex flex-col items-start gap-2">
      <Button type="submit" variant={variant} disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <CreditCard />}
        {label}
      </Button>
      {state?.error && <FieldError>{state.error}</FieldError>}
      {state?.notice && (
        <p className="text-muted-foreground text-xs">{state.notice}</p>
      )}
    </form>
  )
}
