'use client'

import { useState, useTransition } from 'react'
import { cancelSubscriptionAction, resumeSubscriptionAction } from './actions'
import { Button } from '@/components/ui/button'

/**
 * Cancel / resume.
 *
 * Cancellation is scheduled for the end of the period rather than immediate, and
 * the confirmation says so — a customer who has paid through the 30th should not
 * lose their sites on the 12th because a button was blunt.
 *
 * Hidden entirely on the free plan: there is nothing to cancel, and offering it
 * invites someone to click it expecting their account to close.
 */
export function SubscriptionControls({
  cancelAtPeriodEnd,
  isFreePlan,
}: {
  cancelAtPeriodEnd: boolean
  isFreePlan: boolean
}) {
  const [isPending, startTransition] = useTransition()
  const [state, setState] = useState<{ error?: string; notice?: string }>({})

  if (isFreePlan && !cancelAtPeriodEnd) return null

  return (
    <div className="flex flex-col items-end gap-1">
      {cancelAtPeriodEnd ? (
        <Button
          variant="outline"
          size="sm"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              setState((await resumeSubscriptionAction()) ?? {})
            })
          }
        >
          {isPending ? 'Working…' : 'Keep my plan'}
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          disabled={isPending}
          onClick={() => {
            if (
              !window.confirm(
                'Cancel at the end of the current period? You keep everything until then, and afterwards the workspace moves to the free plan.'
              )
            ) {
              return
            }
            startTransition(async () => {
              setState((await cancelSubscriptionAction()) ?? {})
            })
          }}
        >
          {isPending ? 'Working…' : 'Cancel plan'}
        </Button>
      )}

      {state.error && (
        <p className="text-destructive max-w-64 text-right text-xs">
          {state.error}
        </p>
      )}
      {state.notice && (
        <p className="max-w-64 text-right text-xs text-emerald-600">
          {state.notice}
        </p>
      )}
    </div>
  )
}
