'use client'

import { useEffect } from 'react'
import {
  useForm,
  useFieldArray,
  Controller,
  type Control,
  type UseFormRegister,
} from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Trash2, GripVertical } from 'lucide-react'
import type { FieldConfig } from '../sections/editorFields'
import type { SectionDefinition } from '../sections/registry'
import { ImagePicker } from './ImagePicker'
import { useProductCatalog } from './ProductCatalogContext'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'

/**
 * The blank value a newly appended array item starts with, per field type.
 * Types must seed with their own empty value rather than `''` — a number field
 * seeded with a string produces NaN the first time Liquid does arithmetic on
 * it, and a boolean seeded with `''` renders as unchecked but serialises as a
 * string.
 */
function emptyValueForField(field: FieldConfig): unknown {
  switch (field.type) {
    case 'array':
    case 'stringArray':
      return []
    case 'boolean':
      return false
    case 'number':
      return field.min ?? 0
    case 'select':
      return field.options[0] ?? ''
    default:
      return ''
  }
}

/**
 * Picks the variant a selling section will actually sell.
 *
 * Stores the variant id, not a name: the order endpoint prices and reserves
 * stock from this id, so a section pointing at a product that was renamed or
 * deleted fails loudly at order time instead of silently selling nothing. When
 * the store has no products yet the control says so rather than rendering an
 * empty dropdown the merchant would poke at.
 */
function ProductField({
  name,
  label,
  register,
}: {
  name: string
  label: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register: UseFormRegister<any>
}) {
  const variants = useProductCatalog()

  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      {variants.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No products yet — add one under Products, then choose it here.
        </p>
      ) : (
        <select
          {...register(name)}
          className="border-input bg-card h-10 rounded-[0.875rem] border px-3 text-sm"
        >
          <option value="">Choose a product…</option>
          {variants.map((variant) => (
            <option key={variant.variantId} value={variant.variantId}>
              {variant.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  )
}

function FieldRenderer({
  field,
  namePrefix,
  control,
  register,
}: {
  field: FieldConfig
  namePrefix: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: Control<any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register: UseFormRegister<any>
}) {
  const name = namePrefix ? `${namePrefix}.${field.name}` : field.name

  if (field.type === 'text') {
    return (
      <Field>
        <FieldLabel>{field.label}</FieldLabel>
        <Input {...register(name)} />
      </Field>
    )
  }

  if (field.type === 'image') {
    return (
      <Controller
        name={name}
        control={control}
        render={({ field: controllerField }) => (
          <Field>
            <FieldLabel>{field.label}</FieldLabel>
            <ImagePicker
              value={(controllerField.value as string) ?? ''}
              onChange={controllerField.onChange}
            />
          </Field>
        )}
      />
    )
  }

  if (field.type === 'textarea') {
    return (
      <Field>
        <FieldLabel>{field.label}</FieldLabel>
        <Textarea {...register(name)} rows={3} />
      </Field>
    )
  }

  if (field.type === 'color') {
    return (
      <Field>
        <FieldLabel>{field.label}</FieldLabel>
        <div className="flex items-center gap-2">
          <Input type="color" {...register(name)} className="h-9 w-14 p-1" />
          {/* The text input is the accessible path to the value: a bare
              <input type="color"> can't be typed into or pasted a hex code. */}
          <Input {...register(name)} placeholder="#000000" />
        </div>
      </Field>
    )
  }

  if (field.type === 'number') {
    return (
      <Field>
        <FieldLabel>{field.label}</FieldLabel>
        <Input
          type="number"
          min={field.min}
          max={field.max}
          step={field.step}
          // valueAsNumber keeps the stored content numeric; without it a
          // number input round-trips as a string and breaks Liquid's
          // arithmetic filters on the value.
          {...register(name, { valueAsNumber: true })}
        />
      </Field>
    )
  }

  if (field.type === 'product') {
    return <ProductField name={name} label={field.label} register={register} />
  }

  if (field.type === 'select') {
    return (
      <Field>
        <FieldLabel>{field.label}</FieldLabel>
        <select
          {...register(name)}
          className="border-input bg-card h-10 rounded-[0.875rem] border px-3 text-sm"
        >
          {field.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </Field>
    )
  }

  if (field.type === 'boolean') {
    return (
      <Controller
        name={name}
        control={control}
        render={({ field: controllerField }) => (
          <Field orientation="horizontal">
            <Switch
              checked={!!controllerField.value}
              onCheckedChange={controllerField.onChange}
            />
            <FieldLabel>{field.label}</FieldLabel>
          </Field>
        )}
      />
    )
  }

  if (field.type === 'stringArray') {
    return (
      <StringArrayField
        name={name}
        label={field.label}
        control={control}
        register={register}
      />
    )
  }

  return (
    <ArrayField
      name={name}
      label={field.label}
      itemFields={field.itemFields}
      control={control}
      register={register}
    />
  )
}

function ArrayField({
  name,
  label,
  itemFields,
  control,
  register,
}: {
  name: string
  label: string
  itemFields: FieldConfig[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: Control<any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register: UseFormRegister<any>
}) {
  const { fields, append, remove } = useFieldArray({ control, name })

  const emptyItem = Object.fromEntries(
    itemFields.map((f) => [f.name, emptyValueForField(f)])
  )

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium">{label}</p>
      <div className="flex flex-col gap-3">
        {fields.map((item, index) => (
          <div key={item.id} className="rounded-lg border p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-muted-foreground flex items-center gap-1 text-xs">
                <GripVertical className="size-3.5" />
                Item {index + 1}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => remove(index)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
            <div className="flex flex-col gap-2">
              {itemFields.map((itemField) => (
                <FieldRenderer
                  key={itemField.name}
                  field={itemField}
                  namePrefix={`${name}.${index}`}
                  control={control}
                  register={register}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => append(emptyItem)}
      >
        <Plus className="size-3.5" /> Add {label.toLowerCase()}
      </Button>
    </div>
  )
}

function StringArrayField({
  name,
  label,
  control,
  register,
}: {
  name: string
  label: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: Control<any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register: UseFormRegister<any>
}) {
  const { fields, append, remove } = useFieldArray({
    control,
    // useFieldArray requires an array of objects; string arrays are wrapped
    // as { value: string } and unwrapped again in onSubmit/onChange.
    name: name as never,
  })

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">{label}</p>
      {fields.map((item, index) => (
        <div key={item.id} className="flex gap-2">
          <Input {...register(`${name}.${index}.value` as never)} />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => remove(index)}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onClick={() => append({ value: '' } as any)}
      >
        <Plus className="size-3.5" /> Add
      </Button>
    </div>
  )
}

/**
 * Renders an editable form for any section type, driven entirely by its
 * `editorFields` config — one generic engine instead of 18 bespoke
 * Editor.tsx files. Fires `onChange` on every keystroke (for instant
 * canvas + Zustand sync); the caller is responsible for debouncing the
 * actual server autosave.
 */
export function SectionInspectorForm<T extends Record<string, unknown>>({
  definition,
  value,
  onChange,
}: {
  definition: SectionDefinition<T>
  value: T
  onChange: (value: T) => void
}) {
  const { control, register, watch } = useForm<T>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(definition.schema as any),
    defaultValues: toFormValues(definition.editorFields, value) as never,
  })

  useEffect(() => {
    const subscription = watch((formValue) => {
      onChange(fromFormValues(definition.editorFields, formValue as never) as T)
    })
    return () => subscription.unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watch])

  return (
    <form className="flex flex-col gap-4">
      <FieldsRenderer
        fields={definition.editorFields}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        control={control as Control<any>}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        register={register as UseFormRegister<any>}
      />
    </form>
  )
}

/**
 * Renders a list of FieldConfig into inputs.
 *
 * Shared by the registry-driven inspector above and the Liquid one, so a
 * section authored in Liquid gets exactly the same controls as a built-in.
 */
export function FieldsRenderer({
  fields,
  control,
  register,
}: {
  fields: FieldConfig[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: Control<any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register: UseFormRegister<any>
}) {
  return (
    <>
      {fields.map((field) => (
        <FieldRenderer
          key={field.name}
          field={field}
          namePrefix=""
          control={control}
          register={register}
        />
      ))}
    </>
  )
}

/** stringArray fields are stored as string[] but edited as {value: string}[] (useFieldArray needs objects). */
export function toFormValues(
  fields: FieldConfig[],
  value: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...value }
  for (const field of fields) {
    if (field.type === 'stringArray') {
      const arr = (value[field.name] as string[] | undefined) ?? []
      result[field.name] = arr.map((v) => ({ value: v }))
    } else if (field.type === 'array') {
      const arr =
        (value[field.name] as Record<string, unknown>[] | undefined) ?? []
      result[field.name] = arr.map((item) =>
        toFormValues(field.itemFields, item)
      )
    }
  }
  return result
}

export function fromFormValues(
  fields: FieldConfig[],
  value: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...value }
  for (const field of fields) {
    if (field.type === 'stringArray') {
      const arr = (value[field.name] as { value: string }[] | undefined) ?? []
      result[field.name] = arr.map((item) => item?.value ?? '')
    } else if (field.type === 'array') {
      const arr =
        (value[field.name] as Record<string, unknown>[] | undefined) ?? []
      result[field.name] = arr.map((item) =>
        fromFormValues(field.itemFields, item)
      )
    }
  }
  return result
}
