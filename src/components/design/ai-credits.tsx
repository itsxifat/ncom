'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Coins } from 'lucide-react'
import {
  aiBuilderStatusAction,
  type AiBuilderStatus,
} from '@/app/(dashboard)/stores/design-actions'
import { cn } from '@/lib/utils'

/**
 * The AI builder's status for the screen it is on: what a request costs and
 * how many credits the workspace has, asked once when the screen opens and
 * again after every request — the request itself changes the answer.
 */
export function useAiBuilderStatus() {
  const [status, setStatus] = useState<AiBuilderStatus | null>(null)

  const refresh = useCallback(() => {
    aiBuilderStatusAction()
      .then(setStatus)
      .catch(() => {
        // Not knowing the balance is not a reason to block the button: the
        // server checks it again, and says so, when the request is sent.
      })
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { status, refresh }
}

const BUY_CREDITS_HREF = '/billing#ai-credits'

/**
 * "Uses 4 credits · 37 left · Buy credits", under an AI button.
 *
 * Says it before the press, not after: a merchant should know what a request
 * costs, and that they cannot afford it, before they type out what they want.
 */
export function AiCreditsNote({
  cost,
  status,
  className,
}: {
  cost: number
  status: AiBuilderStatus | null
  className?: string
}) {
  const credits = status?.credits
  if (!credits) return null
  const short = cost > credits.available
  const refreshes = new Date(credits.refreshesAt).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })

  return (
    <p
      className={cn(
        'flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs',
        short ? 'text-destructive' : 'text-muted-foreground',
        className
      )}
    >
      <Coins className="size-3.5 shrink-0" />
      {short ? (
        <span>
          {credits.available === 0
            ? 'No AI credits left.'
            : `Needs ${cost} credits — you have ${credits.available}.`}
          {credits.monthlyAllowance > 0 && ` More on ${refreshes}.`}
        </span>
      ) : (
        <span>
          Uses {cost} {cost === 1 ? 'credit' : 'credits'} · {credits.available}{' '}
          left
        </span>
      )}
      <Link
        href={BUY_CREDITS_HREF}
        target="_blank"
        className="text-foreground font-medium underline-offset-2 hover:underline"
      >
        Buy credits
      </Link>
    </p>
  )
}

/** Whether a request of this cost can be sent: unknown counts as yes. */
export function canAfford(status: AiBuilderStatus | null, cost: number) {
  return !status?.credits || cost <= status.credits.available
}
