'use client'

import { useTransition } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import { switchOrganizationAction } from '@/app/(dashboard)/actions'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

type OrgOption = {
  id: string
  name: string
}

export function OrgSwitcher({
  activeOrgId,
  organizations,
  compact = false,
  className,
}: {
  activeOrgId: string
  organizations: OrgOption[]
  /**
   * Drops the "Workspace" label and the chevron, for the mobile top bar where
   * the control has a third of the width and the surrounding chrome already
   * says what it is.
   */
  compact?: boolean
  className?: string
}) {
  const [isPending, startTransition] = useTransition()
  const active = organizations.find((org) => org.id === activeOrgId)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            className={cn('h-10 max-w-full justify-start gap-2.5', className)}
            disabled={isPending}
          />
        }
      >
        <span className="bg-lime text-lime-foreground font-display flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold">
          {(active?.name ?? '?').slice(0, 1).toUpperCase()}
        </span>
        <span className="flex min-w-0 flex-col items-start gap-1">
          {!compact && (
            <span className="eyebrow text-ink-muted">Workspace</span>
          )}
          <span className="max-w-full truncate text-sm font-medium">
            {active?.name ?? 'Select workspace'}
          </span>
        </span>
        {!compact && (
          <ChevronsUpDown className="ml-auto size-4 shrink-0 opacity-40" />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {organizations.map((org) => (
            <DropdownMenuItem
              key={org.id}
              onClick={() => {
                if (org.id === activeOrgId) return
                startTransition(() => {
                  switchOrganizationAction(org.id)
                })
              }}
            >
              <Check
                className={cn(
                  'size-4',
                  org.id === activeOrgId ? 'opacity-100' : 'opacity-0'
                )}
              />
              <span className="truncate">{org.name}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
