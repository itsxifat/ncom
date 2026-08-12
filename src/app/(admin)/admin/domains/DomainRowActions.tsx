'use client'

import { useState, useTransition } from 'react'
import { BadgeCheck, MoreHorizontal, RotateCcw, ShieldX } from 'lucide-react'
import { setDomainStatusAction } from './actions'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

/**
 * Forcing a domain's status.
 *
 * Deliberately behind a menu with a confirmation: marking a domain verified skips
 * the TXT ownership proof, which is the only thing stopping one tenant from
 * claiming a hostname they do not own. It exists because a handful of real setups
 * (proxied DNS, zones we verified out of band) cannot pass the automatic check.
 */
export function DomainRowActions({
  domainId,
  hostname,
  status,
}: {
  domainId: string
  hostname: string
  status: string
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const set = (next: 'VERIFIED' | 'PENDING' | 'FAILED', warning?: string) => {
    if (warning && !window.confirm(warning)) return
    startTransition(async () => {
      const result = await setDomainStatusAction(domainId, hostname, next)
      setError(result.error ?? null)
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              title="Domain actions"
              disabled={isPending}
            >
              <MoreHorizontal />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          {status !== 'VERIFIED' && (
            <DropdownMenuItem
              onClick={() =>
                set(
                  'VERIFIED',
                  `Mark ${hostname} verified without a DNS check? This skips proof that the tenant owns it.`
                )
              }
            >
              <BadgeCheck /> Force verified
            </DropdownMenuItem>
          )}
          {status !== 'PENDING' && (
            <DropdownMenuItem onClick={() => set('PENDING')}>
              <RotateCcw /> Reset to pending
            </DropdownMenuItem>
          )}
          {status !== 'FAILED' && (
            <DropdownMenuItem
              variant="destructive"
              onClick={() => set('FAILED')}
            >
              <ShieldX /> Mark failed
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {error && (
        <p className="text-destructive max-w-56 text-right text-xs">{error}</p>
      )}
    </div>
  )
}
