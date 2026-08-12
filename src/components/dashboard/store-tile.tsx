import Link from 'next/link'
import { ArrowPuck } from '@/components/app/arrow-puck'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

/**
 * The tile stays a plain container with a stretched-link overlay rather than a
 * wrapping <a>, so an actions menu can sit inside it without nesting a button
 * in a link.
 */
export function StoreTile({
  href,
  name,
  subdomain,
  rootDomain,
  pageCount,
  actions,
  className,
}: {
  href: string
  name: string
  subdomain: string
  /** `env.ROOT_DOMAIN`, passed in so the tile shows the address that resolves. */
  rootDomain: string
  pageCount: number
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'group/tile bg-card ring-foreground/6 shadow-puck hover:shadow-lift relative flex flex-col justify-between gap-8 rounded-xl p-5 ring-1 transition-shadow',
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={href}
            className="font-display block truncate text-lg font-semibold tracking-tight outline-none after:absolute after:inset-0 after:rounded-xl"
          >
            {name}
          </Link>
          <p className="text-muted-foreground mt-1 truncate font-mono text-xs">
            {subdomain}.{rootDomain}
          </p>
        </div>
        <ArrowPuck />
      </div>
      <div className="flex items-center justify-between gap-2">
        <Badge variant="secondary">
          {pageCount} {pageCount === 1 ? 'page' : 'pages'}
        </Badge>
        {actions && <div className="relative z-10">{actions}</div>}
      </div>
    </div>
  )
}
