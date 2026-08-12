'use client'

import { useState, useTransition } from 'react'
import { setPlatformFlagAction } from './actions'
import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { SettingsSection } from '@/components/app/settings-section'
import type { PlatformFlagKey } from '@/server/services/platformFlagService'

export interface FlagRow {
  key: PlatformFlagKey
  label: string
  description: string
  group: string
  value: boolean
}

/**
 * The named switches, grouped by area.
 *
 * Saves on toggle rather than behind a Save button: each switch is independent
 * and an operator turning off "enforce plan limits" during an incident should not
 * have to find a submit control. The local optimistic value is reverted if the
 * action reports a failure, so the UI never claims a change that did not happen.
 */
export function PlatformFlags({ flags }: { flags: FlagRow[] }) {
  const groups = Array.from(new Set(flags.map((flag) => flag.group)))

  return (
    <div className="flex flex-col gap-6">
      {groups.map((group) => (
        <SettingsSection key={group} title={group}>
          <Card>
            <CardContent className="flex flex-col gap-1">
              {flags
                .filter((flag) => flag.group === group)
                .map((flag) => (
                  <FlagToggle key={flag.key} flag={flag} />
                ))}
            </CardContent>
          </Card>
        </SettingsSection>
      ))}
    </div>
  )
}

function FlagToggle({ flag }: { flag: FlagRow }) {
  const [value, setValue] = useState(flag.value)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div className="min-w-0">
        <p className="text-sm font-medium">{flag.label}</p>
        <p className="text-muted-foreground text-xs">{flag.description}</p>
        {error && <p className="text-destructive mt-1 text-xs">{error}</p>}
      </div>
      <Switch
        checked={value}
        disabled={isPending}
        aria-label={flag.label}
        onCheckedChange={(next: boolean) => {
          setValue(next)
          startTransition(async () => {
            const result = await setPlatformFlagAction(flag.key, next)
            if (result.error) {
              setValue(!next)
              setError(result.error)
            } else {
              setError(null)
            }
          })
        }}
      />
    </div>
  )
}
