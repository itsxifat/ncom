import { cn } from '@/lib/utils'

/**
 * The column a page's own content lives in, inside the frame's content area.
 *
 * `AppFrame` hands a page the full width beside the rail. Left to itself a page
 * then caps its form at some width and, being a block, that cap lands on the
 * left edge — the page reads as a narrow strip with the display's whole right
 * half empty. The cap belongs here instead, where `mx-auto` centres it and,
 * crucially, applies to the header and the body together: capping only the form
 * leaves the title hanging off to one side of it.
 *
 * `wide` is for pages whose content is a table or a card grid. Those genuinely
 * want every pixel — a row of columns keeps reading fine at 2000px, where a
 * text input does not.
 */
export function PageShell({
  children,
  width = 'default',
  className,
}: {
  children: React.ReactNode
  /** `default` centres a readable column; `wide` fills the frame. */
  width?: 'default' | 'wide'
  className?: string
}) {
  return (
    <div
      className={cn(
        'mx-auto flex w-full min-w-0 flex-col gap-8',
        width === 'default' && 'max-w-[78rem]',
        className
      )}
    >
      {children}
    </div>
  )
}
