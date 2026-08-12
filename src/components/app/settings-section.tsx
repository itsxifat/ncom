import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

/**
 * Forms don't get wider on a wide screen — a 1600px-long input is unusable.
 * Instead the extra width goes to a label column beside the card, so the page
 * fills the display without stretching the fields.
 *
 * The card is supplied here. Callers pass field content, not another `<Card>` —
 * nesting one produces a panel inside a panel with doubled padding and two
 * borders. Content that already carries its own surface, such as a `ListPanel`,
 * passes `bare` instead of being wrapped twice.
 */
export function SettingsSection({
  title,
  description,
  children,
  bare = false,
  className,
}: {
  title: string
  description?: string
  children: React.ReactNode
  /** Skip the card, for children that are already a panel of their own. */
  bare?: boolean
  className?: string
}) {
  return (
    <section
      className={cn(
        'grid gap-4 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)] lg:gap-10',
        className
      )}
    >
      <div className="lg:pt-1.5">
        <h2 className="font-display text-lg font-semibold tracking-tight">
          {title}
        </h2>
        {description && (
          <p className="text-muted-foreground mt-1.5 text-sm text-pretty">
            {description}
          </p>
        )}
      </div>
      {bare ? (
        <div className="w-full min-w-0">{children}</div>
      ) : (
        <Card className="w-full min-w-0">
          <CardContent>{children}</CardContent>
        </Card>
      )}
    </section>
  )
}
