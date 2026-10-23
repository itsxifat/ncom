'use client'

import { useTransition } from 'react'
import Link from 'next/link'
import { useTheme } from 'next-themes'
import {
  Ellipsis,
  LogOut,
  Monitor,
  Moon,
  ShieldCheck,
  Sun,
  UserRound,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuLinkItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const THEMES = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'Match my device', icon: Monitor },
] as const

/**
 * Who is signed in, and the things that belong to them rather than to the
 * workspace: their account, the colour theme, signing out — and, for platform
 * admins, the way into the admin panel.
 *
 * These used to be loose in the rail (a theme switch, a sign-out icon, an
 * Admin entry in the nav). Gathered behind the one row that already showed the
 * person's name, the rail keeps only the places a merchant works in.
 */
export function AccountMenu({
  name,
  email,
  initials,
  isPlatformAdmin,
  signOutAction,
}: {
  name: string | null | undefined
  email: string | null | undefined
  initials: string | undefined
  isPlatformAdmin: boolean
  signOutAction: () => void | Promise<void>
}) {
  const { theme, setTheme } = useTheme()
  const [signingOut, startSignOut] = useTransition()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Your account"
        className="hover:bg-sidebar-accent aria-expanded:bg-sidebar-accent focus-visible:ring-ring/25 flex min-h-13 w-full items-center gap-2.5 rounded-lg px-2 text-left transition-colors outline-none focus-visible:ring-3"
      >
        <span className="bg-ink text-ink-foreground flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
          {initials}
        </span>
        <span className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="truncate text-sm font-semibold">
            {name ?? email}
          </span>
          {name && (
            <span className="text-muted-foreground truncate text-xs">
              {email}
            </span>
          )}
        </span>
        <Ellipsis className="text-muted-foreground size-4 shrink-0" />
      </DropdownMenuTrigger>

      <DropdownMenuContent side="top" align="start" className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="truncate">{email}</DropdownMenuLabel>
          <DropdownMenuLinkItem render={<Link href="/account/profile" />}>
            <UserRound />
            Your account
          </DropdownMenuLinkItem>
          {isPlatformAdmin && (
            <DropdownMenuLinkItem render={<Link href="/admin" />}>
              <ShieldCheck />
              Platform admin
            </DropdownMenuLinkItem>
          )}
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuLabel>Theme</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={theme}
            onValueChange={(value) => setTheme(String(value))}
          >
            {THEMES.map((option) => {
              const Icon = option.icon
              return (
                <DropdownMenuRadioItem key={option.value} value={option.value}>
                  <Icon />
                  {option.label}
                </DropdownMenuRadioItem>
              )
            })}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          disabled={signingOut}
          onClick={() => startSignOut(() => signOutAction())}
        >
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
