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
}: {
  activeOrgId: string
  organizations: OrgOption[]
}) {
  const [isPending, startTransition] = useTransition()
  const active = organizations.find((org) => org.id === activeOrgId)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            className="w-full justify-between"
            disabled={isPending}
          />
        }
      >
        <span className="truncate">{active?.name ?? 'Select workspace'}</span>
        <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
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
