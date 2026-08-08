'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function GlobalError({
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
        <Button render={<Link href="/" />} nativeButton={false}>
          Go home
        </Button>
      </div>
    </div>
  )
}
