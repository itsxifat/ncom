'use client'

import { useActionState, useState } from 'react'
import type { ThemeFormState } from '@/lib/validation/theme'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { PageTheme } from '@/modules/sections/types'
import { ImagePicker } from '@/modules/builder/ImagePicker'
import { Checkbox } from '@/components/ui/checkbox'
import { FormSelect } from '@/components/ui/form-select'

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
  logoUrl,
  faviconUrl,
}: {
  action: (
    prevState: ThemeFormState,
    formData: FormData
  ) => Promise<ThemeFormState>
  theme: PageTheme
  /** Current logo URL, so the picker can show it. */
  logoUrl?: string | null
  faviconUrl?: string | null
}) {
  const [state, action, pending] = useActionState(boundAction, undefined)
  const [logo, setLogo] = useState(logoUrl ?? '')
  const [favicon, setFavicon] = useState(faviconUrl ?? '')

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
            <FormSelect
              id="buttonStyle"
              name="buttonStyle"
              defaultValue={theme.buttonStyle}
            >
              <option value="SOLID">Solid</option>
              <option value="OUTLINE">Outline</option>
              <option value="GHOST">Ghost</option>
            </FormSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor="borderRadius">Border radius</FieldLabel>
            <FormSelect
              id="borderRadius"
              name="borderRadius"
              defaultValue={theme.borderRadius}
            >
              <option value="none">None</option>
              <option value="sm">Small</option>
              <option value="md">Medium</option>
              <option value="lg">Large</option>
              <option value="full">Full</option>
            </FormSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor="spacingScale">Spacing</FieldLabel>
            <FormSelect
              id="spacingScale"
              name="spacingScale"
              defaultValue={theme.spacingScale}
            >
              <option value="compact">Compact</option>
              <option value="comfortable">Comfortable</option>
              <option value="spacious">Spacious</option>
            </FormSelect>
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

        <Field>
          <FieldLabel>Logo</FieldLabel>
          {/* Mirrors how sections store images: the picker yields a CDN URL,
              which is written straight into a hidden input. */}
          <input type="hidden" name="logoUrl" value={logo} />
          <ImagePicker value={logo} onChange={setLogo} />
        </Field>

        <Field>
          <FieldLabel>Favicon</FieldLabel>
          <input type="hidden" name="faviconUrl" value={favicon} />
          <ImagePicker value={favicon} onChange={setFavicon} />
          <FieldDescription>
            The small icon shown in the browser tab. A square PNG of 32×32 or
            larger works best.
          </FieldDescription>
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field>
            <FieldLabel htmlFor="logoWidth">Logo width (px)</FieldLabel>
            <Input
              id="logoWidth"
              name="logoWidth"
              type="number"
              min={40}
              max={480}
              defaultValue={theme.logoWidth ?? 140}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="headingWeight">Heading weight</FieldLabel>
            <FormSelect
              id="headingWeight"
              name="headingWeight"
              defaultValue={theme.headingWeight ?? '600'}
            >
              <option value="400">Regular</option>
              <option value="500">Medium</option>
              <option value="600">Semibold</option>
              <option value="700">Bold</option>
              <option value="800">Extra bold</option>
            </FormSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor="bodyScale">Text size</FieldLabel>
            <FormSelect
              id="bodyScale"
              name="bodyScale"
              defaultValue={theme.bodyScale ?? '1'}
            >
              <option value="0.9">Small</option>
              <option value="1">Default</option>
              <option value="1.1">Large</option>
              <option value="1.2">Extra large</option>
            </FormSelect>
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="sectionSpacing">Section spacing</FieldLabel>
            <FormSelect
              id="sectionSpacing"
              name="sectionSpacing"
              defaultValue={theme.sectionSpacing ?? 'comfortable'}
            >
              <option value="compact">Compact</option>
              <option value="comfortable">Comfortable</option>
              <option value="spacious">Spacious</option>
            </FormSelect>
          </Field>
          <Field>
            <label className="flex h-10 items-center gap-2 text-sm">
              <Checkbox
                name="showStickyHeader"
                defaultChecked={theme.showStickyHeader ?? true}
              />
              Sticky header on scroll
            </label>
          </Field>
        </div>

        <Field>
          <FieldLabel htmlFor="customCss">Custom CSS</FieldLabel>
          <textarea
            id="customCss"
            name="customCss"
            rows={8}
            defaultValue={theme.customCss ?? ''}
            spellCheck={false}
            className="border-input bg-card focus-visible:border-ring focus-visible:ring-ring/50 w-full rounded-lg border p-3 font-mono text-[13px] outline-none focus-visible:ring-3"
            placeholder=".product__title { letter-spacing: -0.02em; }"
          />
          <FieldDescription>
            Applied inside your storefront only — it cannot affect the NCOM
            dashboard.
          </FieldDescription>
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
