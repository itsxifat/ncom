import Link from 'next/link'
import { auth } from '@/server/auth/auth'
import { Button } from '@/components/ui/button'

export default async function Home() {
  const session = await auth()

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 text-center">
      <h1 className="max-w-xl text-4xl font-semibold tracking-tight text-balance">
        Build and publish landing pages, visually.
      </h1>
      <p className="text-muted-foreground mt-4 max-w-md text-lg text-balance">
        NCOM lets you pick a template, customize it with a visual editor, and
        publish — no code required.
      </p>
      <div className="mt-8 flex gap-3">
        {session?.user ? (
          <Button
            render={<Link href="/dashboard" />}
            nativeButton={false}
            size="lg"
          >
            Go to dashboard
          </Button>
        ) : (
          <>
            <Button
              render={<Link href="/register" />}
              nativeButton={false}
              size="lg"
            >
              Get started
            </Button>
            <Button
              render={<Link href="/login" />}
              nativeButton={false}
              size="lg"
              variant="outline"
            >
              Sign in
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
