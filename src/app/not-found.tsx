import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
      <p className="text-muted-foreground text-sm font-semibold tracking-widest uppercase">
        404
      </p>
      <h1 className="font-display text-3xl font-semibold tracking-tight">
        Page not found
      </h1>
      <p className="text-muted-foreground max-w-sm text-balance">
        The page you&apos;re looking for doesn&apos;t exist or may have been
        moved.
      </p>
      <Button render={<Link href="/" />} nativeButton={false}>
        Go home
      </Button>
    </div>
  )
}
