import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

/**
 * Forms don't get wider on a wide screen — a 1600px-long input is unusable.
 * Instead the extra width goes to a label column beside the card, so the page
 * fills the display without stretching the fields.
 */
export function SettingsSection({
  title,
  description,
  children,
  className,
}: {
  title: string
  description?: string
  children: React.ReactNode
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
      <Card className="w-full max-w-2xl">
        <CardContent>{children}</CardContent>
      </Card>
    </section>
  )
}
