'use client'

import { useState } from 'react'
import { ChevronDown, CircleAlert, Info, Wrench } from 'lucide-react'
import type { DesignIssue } from '@/modules/sitespec/normalize'
import { cn } from '@/lib/utils'

/**
 * What happened to a design on its way in, said the way a merchant would want
 * to hear it: how much of it was used, and — one tap away — each small thing
 * that was fixed or left out. Reassuring by default, because the usual case is
 * "it all worked, with a few tidy-ups", and detailed on request, because the
 * merchant may want to ask their AI to fix the parts that were dropped.
 */
export function DesignIssues({
  issues,
  className,
}: {
  issues: DesignIssue[]
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const errors = issues.filter((issue) => issue.level === 'error')
  const fixes = issues.filter((issue) => issue.level === 'warning')
  const notes = issues.filter((issue) => issue.level === 'info')

  if (issues.length === 0) {
    return (
      <p
        className={cn(
          'text-sm text-emerald-700 dark:text-emerald-400',
          className
        )}
      >
        Everything in the design was used as it was.
      </p>
    )
  }

  const summary = [
    errors.length > 0 &&
      `${errors.length} part${errors.length === 1 ? '' : 's'} left out`,
    fixes.length > 0 &&
      `${fixes.length} small fix${fixes.length === 1 ? '' : 'es'}`,
    notes.length > 0 && `${notes.length} note${notes.length === 1 ? '' : 's'}`,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className={cn('bg-muted/60 rounded-xl text-sm', className)}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
        aria-expanded={open}
      >
        {errors.length > 0 ? (
          <CircleAlert className="size-4 shrink-0 text-amber-600" />
        ) : (
          <Wrench className="text-muted-foreground size-4 shrink-0" />
        )}
        <span className="font-medium">{summary}</span>
        <span className="text-muted-foreground ml-auto text-xs">
          {open ? 'Hide' : 'Show'}
        </span>
        <ChevronDown
          className={cn(
            'text-muted-foreground size-4 transition-transform',
            open && 'rotate-180'
          )}
        />
      </button>
      {open && (
        <ul className="flex max-h-64 flex-col gap-1.5 overflow-y-auto px-3 pb-3">
          {[...errors, ...fixes, ...notes].map((issue, index) => (
            <li key={index} className="flex gap-2">
              {issue.level === 'error' ? (
                <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
              ) : issue.level === 'warning' ? (
                <Wrench className="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
              ) : (
                <Info className="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
              )}
              <span>
                <span className="text-muted-foreground">{issue.where}: </span>
                {issue.message}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
