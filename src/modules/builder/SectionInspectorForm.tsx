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
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'

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

  if (field.type === 'select') {
    return (
      <Field>
        <FieldLabel>{field.label}</FieldLabel>
        <select
          {...register(name)}
          className="border-input h-8 rounded-lg border bg-transparent px-2.5 text-sm"
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
    itemFields.map((f) => [
      f.name,
      f.type === 'array' || f.type === 'stringArray' ? [] : '',
    ])
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
      {definition.editorFields.map((field) => (
        <FieldRenderer
          key={field.name}
          field={field}
          namePrefix=""
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          control={control as Control<any>}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          register={register as UseFormRegister<any>}
        />
      ))}
    </form>
  )
}

/** stringArray fields are stored as string[] but edited as {value: string}[] (useFieldArray needs objects). */
function toFormValues(
  fields: FieldConfig[],
  value: Record<string, unknown>
): unknown {
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

function fromFormValues(
  fields: FieldConfig[],
  value: Record<string, unknown>
): unknown {
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
