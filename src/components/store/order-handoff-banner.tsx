import Link from 'next/link'
import { AlertTriangle, ArrowRight, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

/**
 * What this Orders screen actually is.
 *
 * Two very different things live at the same URL now, and the difference has to
 * be visible at a glance: a workspace processing its own orders has a working
 * queue here, while one handing them over has a *record* of orders somebody
 * else is packing. Without this strip the second kind reads as the first, and
 * the first thing that happens is someone tries to dispatch a courier for an
 * order that shipped from another system yesterday.
 *
 * It also carries the choice itself, because the Orders screen is where a
 * merchant is standing when they wonder where their orders should go.
 */
export function OrderHandoffBanner({
  forwarding,
  endpointHost,
  pending,
  stuck,
  conflicted,
}: {
  forwarding: boolean
  /** The host orders are handed to, for a sentence a human can read. */
  endpointHost: string | null
  pending: number
  stuck: number
  conflicted: number
}) {
  // A disagreement leads, ahead even of an undelivered order. An order nobody
  // received is one problem in one place; an order that says different things
  // in two places is a number somebody is about to act on believing it.
  if (conflicted > 0) {
    return (
      <Card className="border-destructive/50">
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-destructive flex items-start gap-2 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>
              <strong>
                {conflicted} {conflicted === 1 ? 'order' : 'orders'}
              </strong>{' '}
              changed here and on{' '}
              {endpointHost ? <code>{endpointHost}</code> : 'your website'} at
              the same time, so the two now disagree. Syncing has stopped for
              them until somebody decides which version is right — open each one
              to compare.
            </span>
          </p>
        </CardContent>
      </Card>
    )
  }

  // The failure case leads, whatever the mode. An order their website never
  // received is the one thing on this screen that costs money while nobody
  // looks at it.
  if (stuck > 0) {
    return (
      <Card className="border-destructive/50">
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-destructive flex items-start gap-2 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>
              <strong>
                {stuck} {stuck === 1 ? 'order' : 'orders'}
              </strong>{' '}
              could not be delivered to{' '}
              {endpointHost ? <code>{endpointHost}</code> : 'your website'}.
              They exist here and do not exist there — open each one to see why
              and send it again.
            </span>
          </p>
          <Button
            variant="outline"
            size="sm"
            render={<Link href="/settings/order-destination" />}
            nativeButton={false}
          >
            Check the endpoint
            <ArrowRight />
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (!forwarding) {
    return (
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-muted-foreground text-sm">
            Orders are processed here — screened, dispatched and tracked in
            NCOM. Already run a website with its own order book? Orders can be
            handed straight to it instead.
          </p>
          <Button
            variant="outline"
            size="sm"
            render={<Link href="/settings/order-destination" />}
            nativeButton={false}
          >
            <Send />
            Change where orders go
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-primary/40">
      <CardContent className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm">
          Orders are handed to{' '}
          {endpointHost ? <code>{endpointHost}</code> : 'your website'} as they
          are placed. This list is the record of what was sent — nothing here is
          screened, dispatched or fulfilled by NCOM.
          {pending > 0 && (
            <>
              {' '}
              <span className="text-muted-foreground">
                {pending} {pending === 1 ? 'is' : 'are'} still on the way.
              </span>
            </>
          )}
        </p>
        <Button
          variant="ghost"
          size="sm"
          render={<Link href="/settings/order-destination" />}
          nativeButton={false}
        >
          Settings
          <ArrowRight />
        </Button>
      </CardContent>
    </Card>
  )
}
