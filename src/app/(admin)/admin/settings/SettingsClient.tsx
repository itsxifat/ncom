'use client'

import { useTransition, useActionState } from 'react'
import { Plus, SlidersHorizontal, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { EmptyState } from '@/components/app/empty-state'
import { ListPanel, ListRow, ListRowActions } from '@/components/app/list-panel'
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
    <div className="flex max-w-5xl flex-col gap-6">
      <Card>
        <CardContent>
          <form action={action}>
            <FieldGroup>
              <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]">
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
                <Button type="submit" disabled={pending}>
                  <Plus />
                  {pending ? 'Saving…' : 'Save setting'}
                </Button>
              </div>
              {state?.error && <FieldError>{state.error}</FieldError>}
            </FieldGroup>
          </form>
        </CardContent>
      </Card>

      {settings.length === 0 ? (
        <EmptyState
          icon={SlidersHorizontal}
          title="No platform settings"
          description="Add a key above to store platform-wide configuration."
        />
      ) : (
        <ListPanel>
          {settings.map((setting) => (
            <ListRow key={setting.key}>
              <div className="min-w-0">
                <p className="truncate font-mono text-sm font-medium">
                  {setting.key}
                </p>
                <p className="text-muted-foreground mt-1 truncate font-mono text-xs">
                  {JSON.stringify(setting.value)}
                </p>
              </div>
              <ListRowActions>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={isPending}
                  onClick={() => {
                    if (!window.confirm(`Delete setting "${setting.key}"?`)) {
                      return
                    }
                    startTransition(() => {
                      deletePlatformSettingAction(setting.key)
                    })
                  }}
                >
                  <Trash2 />
                  Delete
                </Button>
              </ListRowActions>
            </ListRow>
          ))}
        </ListPanel>
      )}
    </div>
  )
}
