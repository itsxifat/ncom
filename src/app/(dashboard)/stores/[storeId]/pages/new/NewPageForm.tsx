'use client'

import { useActionState, useState } from 'react'
import { createPageAction } from '@/app/(dashboard)/stores/actions'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function NewPageForm({
  storeId,
  starters,
}: {
  storeId: string
  starters: { key: string; name: string; description: string; title: string }[]
}) {
  const [state, action, pending] = useActionState(
    createPageAction.bind(null, storeId),
    undefined
  )
  const [starter, setStarter] = useState(starters[1]?.key ?? starters[0]!.key)
  const [title, setTitle] = useState(
    starters.find((option) => option.key === starter)?.title ?? ''
  )

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 py-4 sm:py-8">
      <div className="flex flex-col gap-1.5">
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          Add a page
        </h1>
        <p className="text-muted-foreground">
          Start from a page that is already written, then change the words.
        </p>
      </div>
      <form
        action={action}
        className="bg-card ring-border flex flex-col gap-6 rounded-2xl p-6 ring-1"
      >
        <input type="hidden" name="starter" value={starter} />
        <div className="grid gap-2 sm:grid-cols-2">
          {starters.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => {
                setStarter(option.key)
                setTitle(option.title)
              }}
              aria-pressed={starter === option.key}
              className={cn(
                'flex flex-col gap-0.5 rounded-xl p-4 text-left ring-1 transition',
                starter === option.key
                  ? 'ring-foreground ring-2'
                  : 'ring-border hover:ring-foreground/30'
              )}
            >
              <span className="font-semibold">{option.name}</span>
              <span className="text-muted-foreground text-sm">
                {option.description}
              </span>
            </button>
          ))}
        </div>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="title">Page name</FieldLabel>
            <Input
              id="title"
              name="title"
              required
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="slug">Web address (optional)</FieldLabel>
            <Input id="slug" name="slug" placeholder="about" />
            <FieldDescription>
              Leave blank to make one from the name.
            </FieldDescription>
          </Field>
          {state?.error && <FieldError>{state.error}</FieldError>}
          <Button type="submit" disabled={pending}>
            {pending ? 'Adding…' : 'Add page and start editing'}
          </Button>
        </FieldGroup>
      </form>
    </div>
  )
}
