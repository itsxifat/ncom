import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PageHeaderProps {
  /** One-word category. Use it only where the page really belongs to a set. */
  eyebrow?: string
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
        <h1 className="font-display text-3xl leading-[1.08] font-semibold tracking-tight text-balance sm:text-4xl 2xl:text-[2.75rem]">
          {title}
        </h1>
        {description && (
          <p className="text-muted-foreground mt-2.5 max-w-2xl text-sm text-pretty sm:text-base">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      )}
    </header>
  )
}
