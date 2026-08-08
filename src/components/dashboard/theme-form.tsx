'use client'

import { useActionState } from 'react'
import type { ThemeFormState } from '@/lib/validation/theme'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { PageTheme } from '@/modules/sections/types'

function ColorField({
  name,
  label,
  defaultValue,
}: {
  name: string
  label: string
  defaultValue: string
}) {
  return (
    <Field>
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      <div className="flex items-center gap-2">
        <input
          type="color"
          defaultValue={defaultValue}
          form="theme-form"
          onChange={(e) => {
            const hexInput = document.getElementById(
              `${name}-hex`
            ) as HTMLInputElement | null
            if (hexInput) hexInput.value = e.target.value
          }}
          className="size-8 shrink-0 cursor-pointer rounded border"
        />
        <Input
          id={`${name}-hex`}
          name={name}
          defaultValue={defaultValue}
          className="font-mono"
        />
      </div>
    </Field>
  )
}

export function ThemeForm({
  action: boundAction,
  theme,
}: {
  action: (
    prevState: ThemeFormState,
    formData: FormData
  ) => Promise<ThemeFormState>
  theme: PageTheme
}) {
  const [state, action, pending] = useActionState(boundAction, undefined)

  return (
    <form id="theme-form" action={action}>
      <FieldGroup>
        <div className="grid grid-cols-2 gap-4">
          <ColorField
            name="primaryColor"
            label="Primary color"
            defaultValue={theme.primaryColor}
          />
          <ColorField
            name="secondaryColor"
            label="Secondary color"
            defaultValue={theme.secondaryColor}
          />
          <ColorField
            name="backgroundColor"
            label="Background color"
            defaultValue={theme.backgroundColor}
          />
          <ColorField
            name="textColor"
            label="Text color"
            defaultValue={theme.textColor}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field>
            <FieldLabel htmlFor="headingFont">Heading font</FieldLabel>
            <Input
              id="headingFont"
              name="headingFont"
              defaultValue={theme.headingFont}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="bodyFont">Body font</FieldLabel>
            <Input
              id="bodyFont"
              name="bodyFont"
              defaultValue={theme.bodyFont}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field>
            <FieldLabel htmlFor="buttonStyle">Button style</FieldLabel>
            <select
              id="buttonStyle"
              name="buttonStyle"
              defaultValue={theme.buttonStyle}
              className="border-input h-8 rounded-lg border bg-transparent px-2.5 text-sm"
            >
              <option value="SOLID">Solid</option>
              <option value="OUTLINE">Outline</option>
              <option value="GHOST">Ghost</option>
            </select>
          </Field>
          <Field>
            <FieldLabel htmlFor="borderRadius">Border radius</FieldLabel>
            <select
              id="borderRadius"
              name="borderRadius"
              defaultValue={theme.borderRadius}
              className="border-input h-8 rounded-lg border bg-transparent px-2.5 text-sm"
            >
              <option value="none">None</option>
              <option value="sm">Small</option>
              <option value="md">Medium</option>
              <option value="lg">Large</option>
              <option value="full">Full</option>
            </select>
          </Field>
          <Field>
            <FieldLabel htmlFor="spacingScale">Spacing</FieldLabel>
            <select
              id="spacingScale"
              name="spacingScale"
              defaultValue={theme.spacingScale}
              className="border-input h-8 rounded-lg border bg-transparent px-2.5 text-sm"
            >
              <option value="compact">Compact</option>
              <option value="comfortable">Comfortable</option>
              <option value="spacious">Spacious</option>
            </select>
          </Field>
        </div>

        <Field>
          <FieldLabel htmlFor="containerWidth">Container width</FieldLabel>
          <Input
            id="containerWidth"
            name="containerWidth"
            defaultValue={theme.containerWidth}
          />
        </Field>

        {state?.error && <FieldError>{state.error}</FieldError>}
        {state?.success && (
          <p className="text-sm text-green-600 dark:text-green-500">
            {state.success}
          </p>
        )}
        <Field>
          <Button type="submit" disabled={pending}>
            {pending ? 'Saving…' : 'Save theme'}
          </Button>
        </Field>
      </FieldGroup>
    </form>
  )
}
