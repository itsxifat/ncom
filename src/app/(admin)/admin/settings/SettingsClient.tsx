'use client'

import { useTransition, useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import {
  upsertPlatformSettingAction,
  deletePlatformSettingAction,
} from './actions'

interface Setting {
  key: string
  value: unknown
  updatedAt: string
}

export function SettingsClient({ settings }: { settings: Setting[] }) {
  const [state, action, pending] = useActionState(
    upsertPlatformSettingAction,
    undefined
  )
  const [isPending, startTransition] = useTransition()

  return (
    <div className="flex flex-col gap-6">
      <form action={action}>
        <FieldGroup>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_2fr_auto]">
            <Field>
              <FieldLabel htmlFor="key">Key</FieldLabel>
              <Input id="key" name="key" placeholder="feature.betaBanner" />
            </Field>
            <Field>
              <FieldLabel htmlFor="value">Value (JSON)</FieldLabel>
              <Input
                id="value"
                name="value"
                placeholder='"Hello" or true or {"a":1}'
              />
            </Field>
            <Field>
              <FieldLabel>&nbsp;</FieldLabel>
              <Button type="submit" disabled={pending}>
                {pending ? 'Saving…' : 'Save'}
              </Button>
            </Field>
          </div>
          {state?.error && <FieldError>{state.error}</FieldError>}
        </FieldGroup>
      </form>

      <div className="flex flex-col divide-y rounded-lg border">
        {settings.length === 0 && (
          <p className="text-muted-foreground p-4 text-sm">
            No platform settings yet.
          </p>
        )}
        {settings.map((setting) => (
          <div
            key={setting.key}
            className="flex items-center justify-between gap-4 px-4 py-3"
          >
            <div className="min-w-0">
              <p className="truncate font-mono text-sm font-medium">
                {setting.key}
              </p>
              <p className="text-muted-foreground truncate text-sm">
                {JSON.stringify(setting.value)}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive shrink-0"
              disabled={isPending}
              onClick={() => {
                if (!window.confirm(`Delete setting "${setting.key}"?`)) return
                startTransition(() => {
                  deletePlatformSettingAction(setting.key)
                })
              }}
            >
              Delete
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}
