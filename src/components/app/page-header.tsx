import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PageHeaderProps {
  /**
   * One-word category. Use it only where the page really belongs to a set.
   *
   * A node rather than a string so a page can put a live element here — an
   * order's placed-at timestamp has to be formatted in the reader's timezone,
   * which only the browser knows.
   */
  eyebrow?: React.ReactNode
  title: string
  description?: React.ReactNode
  actions?: React.ReactNode
  backHref?: string
  backLabel?: string
  className?: string
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  backHref,
  backLabel,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        'flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between lg:gap-8',
        className
      )}
    >
      <div className="min-w-0">
        {backHref && (
          <Link
            href={backHref}
            className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1.5 text-sm font-medium transition-colors"
          >
            <ArrowLeft className="size-4" />
            {backLabel ?? 'Back'}
          </Link>
        )}
        {eyebrow && (
          <p className="eyebrow text-muted-foreground mb-3">{eyebrow}</p>
        )}
        {/* Starts a step smaller than it used to. `text-3xl` on a 390px
            screen spends three lines on a title like "Discounts & offers",
            which is a third of the fold gone before any content. */}
        <h1 className="font-display text-2xl leading-[1.12] font-semibold tracking-tight text-balance sm:text-3xl sm:leading-[1.08] lg:text-4xl 2xl:text-[2.75rem]">
          {title}
        </h1>
        {description && (
          <p className="text-muted-foreground mt-2.5 max-w-2xl text-sm text-pretty sm:text-base">
            {description}
          </p>
        )}
      </div>
      {actions && (
        // Below `sm` each action grows to share the row, so a header with
        // one button gets a full-width one — the shape a primary action
        // should have on a phone — and a header with two gets an even
        // pair, rather than two small pills stranded on the left.
        <div className="flex w-full shrink-0 flex-wrap items-center gap-2 lg:w-auto max-sm:[&>*]:min-w-0 max-sm:[&>*]:flex-1">
          {actions}
        </div>
      )}
    </header>
  )
}
