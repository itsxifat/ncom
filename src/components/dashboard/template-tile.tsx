import Link from 'next/link'
import { ArrowPuck } from '@/components/app/arrow-puck'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * The thumbnail is a miniature of the template's own section stack — one bar
 * per section, in the real order — so the graphic carries information (how
 * long is this page?) instead of decorating the tile with an initial.
 */
function SectionStackPreview({ sectionCount }: { sectionCount: number }) {
  const bars = Array.from({ length: Math.min(sectionCount, 6) })
  const heights = ['h-7', 'h-3', 'h-5', 'h-3', 'h-4', 'h-3']

  return (
    <div className="bg-canvas ring-foreground/6 flex h-36 flex-col gap-1.5 overflow-hidden rounded-[0.875rem] p-3 ring-1">
      {bars.length === 0 ? (
        <div className="text-muted-foreground flex flex-1 items-center justify-center text-xs">
          Empty template
        </div>
      ) : (
        bars.map((_, index) => (
          <div
            key={index}
            className={cn(
              'w-full rounded-[0.3rem]',
              heights[index] ?? 'h-3',
              index === 0
                ? 'bg-lime'
                : 'bg-foreground/10 group-hover/tile:bg-foreground/15'
            )}
          />
        ))
      )}
    </div>
  )
}

export function TemplateTile({
  name,
  categoryName,
  description,
  sectionCount,
  previewHref,
  useHref,
}: {
  name: string
  categoryName: string
  description?: string | null
  sectionCount: number
  previewHref: string
  useHref: string
}) {
  return (
    <div
      data-slot="template-tile"
      className="group/tile bg-card ring-foreground/6 shadow-puck hover:shadow-lift relative flex flex-col gap-4 rounded-xl p-4 ring-1 transition-shadow"
    >
      <SectionStackPreview sectionCount={sectionCount} />

      <div className="flex items-start justify-between gap-3 px-1">
        <div className="min-w-0">
          <Link
            href={previewHref}
            className="font-display block truncate text-base font-semibold tracking-tight outline-none after:absolute after:inset-0 after:rounded-xl"
          >
            {name}
          </Link>
          <p className="eyebrow text-muted-foreground mt-1.5">{categoryName}</p>
        </div>
        <ArrowPuck />
      </div>

      {description && (
        <p className="text-muted-foreground line-clamp-2 px-1 text-sm">
          {description}
        </p>
      )}

      <div className="relative z-10 mt-auto flex items-center gap-2 px-1">
        <Button
          variant="outline"
          size="sm"
          render={<Link href={previewHref} />}
          nativeButton={false}
        >
          Preview
        </Button>
        <Button size="sm" render={<Link href={useHref} />} nativeButton={false}>
          Use template
        </Button>
      </div>
    </div>
  )
}
