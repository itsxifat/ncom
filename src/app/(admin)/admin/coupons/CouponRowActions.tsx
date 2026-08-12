'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { deleteCouponAction } from './actions'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export function CouponRowActions({
  couponId,
  code,
}: {
  couponId: string
  code: string
}) {
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)

  return (
    <div className="flex flex-col items-end gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              title="Coupon actions"
              disabled={isPending}
            >
              <MoreHorizontal />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            render={<Link href={`/admin/coupons/${couponId}`} />}
            nativeButton={false}
          >
            <Pencil /> Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onClick={() => {
              if (
                !window.confirm(
                  `Remove ${code}? If it has been redeemed it will be deactivated instead, so past orders keep their discount.`
                )
              ) {
                return
              }
              startTransition(async () => {
                const result = await deleteCouponAction(couponId)
                setMessage(
                  result.error ??
                    (result.outcome === 'deactivated'
                      ? 'Deactivated — it had redemptions.'
                      : null)
                )
              })
            }}
          >
            <Trash2 /> Remove
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {message && (
        <p className="text-muted-foreground max-w-64 text-right text-xs">
          {message}
        </p>
      )}
    </div>
  )
}
