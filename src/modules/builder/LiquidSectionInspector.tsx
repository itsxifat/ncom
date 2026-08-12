'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import type { FieldConfig } from '../sections/editorFields'
import {
  FieldsRenderer,
  fromFormValues,
  toFormValues,
} from './SectionInspectorForm'

/**
 * Content editor for a Liquid section.
 *
 * Built-in sections get their fields from the React registry; a Liquid section
 * has no entry there, so its fields arrive already compiled from its
 * `{% schema %}` block (see lib/liquid/schema.ts). Both end up rendering
 * through the same FieldsRenderer, which is the point: a section written in
 * Liquid must feel identical to edit as one written in React, or "custom
 * section" becomes a second-class citizen nobody uses.
 */
export function LiquidSectionInspector({
  name,
  editorFields,
  value,
  onChange,
}: {
  name: string
  editorFields: unknown[]
  value: Record<string, unknown>
  onChange: (value: Record<string, unknown>) => void
}) {
  const fields = editorFields as FieldConfig[]

  const { control, register, watch } = useForm({
    defaultValues: toFormValues(fields, value),
  })

  useEffect(() => {
    const subscription = watch((formValue) => {
      onChange(fromFormValues(fields, formValue as never))
    })
    return () => subscription.unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watch])

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground text-xs">{name} · custom section</p>
      <FieldsRenderer fields={fields} control={control} register={register} />
    </div>
  )
}
