'use client'

import { useTransition } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { setUserPlatformRoleAction, setUserSuspendedAction } from './actions'
import type { PlatformRole } from '@/generated/prisma/enums'

export function UserRow({
  userId,
  name,
  email,
  platformRole,
  isSuspended,
  membershipCount,
  isSelf,
}: {
  userId: string
  name: string | null
  email: string
  platformRole: PlatformRole
  isSuspended: boolean
  membershipCount: number
  isSelf: boolean
}) {
  const [isPending, startTransition] = useTransition()

  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{name ?? email}</span>
          {platformRole === 'SUPER_ADMIN' && (
            <Badge variant="default">Admin</Badge>
          )}
          {isSuspended && <Badge variant="destructive">Suspended</Badge>}
        </div>
        <p className="text-muted-foreground truncate text-sm">
          {email} · {membershipCount} {membershipCount === 1 ? 'org' : 'orgs'}
        </p>
      </div>
      {!isSelf && (
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={() => {
              startTransition(() => {
                setUserPlatformRoleAction(
                  userId,
                  platformRole === 'SUPER_ADMIN' ? 'USER' : 'SUPER_ADMIN'
                )
              })
            }}
          >
            {platformRole === 'SUPER_ADMIN' ? 'Revoke admin' : 'Make admin'}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={isSuspended ? '' : 'text-destructive'}
            disabled={isPending}
            onClick={() => {
              startTransition(() => {
                setUserSuspendedAction(userId, !isSuspended)
              })
            }}
          >
            {isSuspended ? 'Unsuspend' : 'Suspend'}
          </Button>
        </div>
      )}
    </div>
  )
}
