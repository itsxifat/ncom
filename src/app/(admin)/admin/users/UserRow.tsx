'use client'

import { useTransition } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  ListRow,
  ListRowActions,
  ListRowText,
} from '@/components/app/list-panel'
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
    <ListRow>
      <ListRowText
        title={name ?? email}
        meta={`${email} · ${membershipCount} ${membershipCount === 1 ? 'org' : 'orgs'}`}
        badges={
          <>
            {platformRole === 'SUPER_ADMIN' && (
              <Badge variant="lime">Admin</Badge>
            )}
            {isSuspended && <Badge variant="destructive">Suspended</Badge>}
            {isSelf && <Badge variant="outline">You</Badge>}
          </>
        }
      />
      {!isSelf && (
        <ListRowActions>
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
            variant={isSuspended ? 'outline' : 'destructive'}
            size="sm"
            disabled={isPending}
            onClick={() => {
              startTransition(() => {
                setUserSuspendedAction(userId, !isSuspended)
              })
            }}
          >
            {isSuspended ? 'Unsuspend' : 'Suspend'}
          </Button>
        </ListRowActions>
      )}
    </ListRow>
  )
}
