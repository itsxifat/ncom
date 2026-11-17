'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

/**
 * A dashboard page that failed, shown inside the dashboard rather than in
 * place of it.
 *
 * Without this boundary an error in any page climbs to the root one and takes
 * the sidebar, the workspace switcher and the billing gate down with it. That
 * matters most for a workspace locked for an unpaid bill: its pages still
 * render on the server, and one that reads with an editor's rights is refused
 * there — but here that refusal stays behind the lock screen (BillingGate),
 * which is what the owner should see.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
      <p className="text-destructive text-sm font-semibold tracking-widest uppercase">
        Error
      </p>
      <h1 className="font-display text-3xl font-semibold tracking-tight">
        Something went wrong
      </h1>
      <p className="text-muted-foreground max-w-sm text-balance">
        An unexpected error occurred. You can try again, or head back to the
        dashboard.
      </p>
      <div className="flex gap-3">
        <Button variant="outline" onClick={() => reset()}>
          Try again
        </Button>
        <Button render={<Link href="/dashboard" />} nativeButton={false}>
          Go to dashboard
        </Button>
      </div>
    </div>
  )
}
