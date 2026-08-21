import Link from 'next/link'
import { ArrowUpRight, Check, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { FEATURE_LABELS, type FeatureKey } from '@/lib/plans'
import type { FeatureAvailability } from '@/generated/prisma/enums'

/**
 * What a merchant sees where a feature their plan does not carry would be.
 *
 * A locked feature is not a missing page. `notFound()` tells someone the thing
 * they clicked in their own sidebar does not exist, which reads as the product
 * being broken — and the merchant's next move is a support ticket rather than
 * an upgrade. So the route still answers, the nav link still works, and the
 * page says which plan carries the feature and what it would give them.
 *
 * The two locked states are deliberately different. ADDON means the plan
 * permits buying it, so the call to action is Billing; anything else means the
 * tier does not sell it at all, so the call to action is the price sheet.
 */
export function FeatureLocked({
  feature,
  planName,
  availability,
  description,
  highlights,
}: {
  feature: FeatureKey
  /** The plan the workspace is actually on, so the message names it. */
  planName: string
  availability: FeatureAvailability
  /** What the feature does, in the merchant's language. */
  description: string
  /** A few concrete things they would get. Keep them specific. */
  highlights?: string[]
}) {
  const label = FEATURE_LABELS[feature]
  const buyableAsAddon = availability === 'ADDON'

  return (
    <div className="bg-card ring-foreground/6 shadow-puck flex flex-col items-center gap-6 rounded-xl px-6 py-14 text-center ring-1 sm:py-20">
      <span className="bg-muted text-muted-foreground flex size-14 items-center justify-center rounded-full">
        <Lock className="size-6" />
      </span>

      <div className="flex flex-col items-center gap-3">
        <Badge variant="outline">Not on {planName}</Badge>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
          {label} is not included in your plan
        </h1>
        <p className="text-muted-foreground max-w-md text-sm text-pretty sm:text-base">
          {description}
        </p>
      </div>

      {highlights && highlights.length > 0 && (
        <ul className="flex max-w-md flex-col gap-2 text-left">
          {highlights.map((item) => (
            <li key={item} className="flex items-start gap-2.5 text-sm">
              <Check className="text-lime-foreground bg-lime mt-0.5 size-4 shrink-0 rounded-full p-0.5" />
              <span className="text-muted-foreground">{item}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button
          nativeButton={false}
          render={
            <Link href={buyableAsAddon ? '/billing' : '/billing/plans'} />
          }
        >
          {buyableAsAddon ? 'Add it from Billing' : 'See plans'}
          <ArrowUpRight />
        </Button>
        {buyableAsAddon && (
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href="/billing/plans" />}
          >
            Compare plans
          </Button>
        )}
      </div>

      <p className="text-muted-foreground text-xs">
        {buyableAsAddon
          ? `${label} is available on ${planName} as a paid add-on.`
          : `${label} is included on every paid plan.`}
      </p>
    </div>
  )
}
