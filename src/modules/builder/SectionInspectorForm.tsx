'use client'

import { useEffect } from 'react'
import {
  useForm,
  useFieldArray,
  useWatch,
  Controller,
  type Control,
  type UseFormRegister,
} from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, RotateCcw, Trash2, GripVertical } from 'lucide-react'
import {
  fieldIsVisible,
  optionLabel,
  optionValue,
  type FieldConfig,
} from '../sections/editorFields'
import type { SectionDefinition } from '../sections/registry'
import { ImagePicker } from './ImagePicker'
import { useProductCatalog } from './ProductCatalogContext'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { FormSelect } from '@/components/ui/form-select'
import { FontPicker } from '@/components/ui/font-picker'
import { DateTimeField } from './DateTimeField'
import { ProductPickerDialog } from '@/components/store/product-picker'
import { formatMoneyAmount } from '@/lib/money'

/**
 * The blank value a newly appended array item starts with, per field type.
 * Types must seed with their own empty value rather than `''` — a number field
 * seeded with a string produces NaN the first time anything does arithmetic on
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
      return field.options[0] ? optionValue(field.options[0]) : ''
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
 *
 * The chosen product is shown as a card with its photo, price and stock rather
 * than as a line of text. A section is a thing on a page that sells something,
 * and "is this the right one?" is answered by looking at it, not by reading an
 * id back.
 */
function ProductField({
  name,
  label,
  control,
}: {
  name: string
  label: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: Control<any>
}) {
  const catalog = useProductCatalog()

  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      {catalog.variants.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No products yet — add one under Products, then choose it here.
        </p>
      ) : (
        <Controller
          name={name}
          control={control}
          render={({ field }) => {
            const chosen = catalog.products.find((product) =>
              product.variants.some((variant) => variant.id === field.value)
            )
            const chosenVariant = chosen?.variants.find(
              (variant) => variant.id === field.value
            )

            return (
              <div className="flex flex-col gap-2">
                {chosen && (
                  <div className="flex items-center gap-2.5 rounded-lg border p-2">
                    <div className="bg-muted size-9 shrink-0 overflow-hidden rounded-md">
                      {chosen.imageUrl && (
                        // eslint-disable-next-line @next/next/no-img-element -- CDN URLs aren't in next/image's remote allowlist
                        <img
                          src={chosen.imageUrl}
                          alt=""
                          className="size-full object-cover"
                        />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">
                        {chosen.title}
                      </p>
                      <p className="text-muted-foreground truncate text-[11px]">
                        {chosenVariant &&
                        chosenVariant.title !== 'Default Title'
                          ? `${chosenVariant.title} · `
                          : ''}
                        {formatMoneyAmount(
                          chosenVariant?.priceCents ?? chosen.minPriceCents,
                          catalog.currencyCode
                        )}
                        {chosenVariant?.tracksInventory
                          ? ` · ${chosenVariant.available} in stock`
                          : ''}
                      </p>
                    </div>
                  </div>
                )}

                <ProductPickerDialog
                  initialProducts={catalog.products}
                  currencyCode={catalog.currencyCode}
                  pickVariant
                  onPick={(_productId, variantId) => field.onChange(variantId)}
                  trigger={
                    <Button type="button" variant="outline" size="sm">
                      {chosen ? 'Change product' : 'Choose a product…'}
                    </Button>
                  }
                />
              </div>
            )
          }}
        />
      )}
    </Field>
  )
}

/**
 * One field, hidden when its `showWhen` condition does not hold.
 *
 * Watches only the sibling the condition names, so a block with a dozen
 * conditional fields does not re-render the whole inspector on every keystroke
 * somewhere else in the form.
 */
function ConditionalField({
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
  const dependency = field.showWhen!.field
  const watched = useWatch({
    control,
    name: namePrefix ? `${namePrefix}.${dependency}` : dependency,
  })

  if (!fieldIsVisible(field, { [dependency]: watched })) return null
  return (
    <FieldRenderer
      field={field}
      namePrefix={namePrefix}
      control={control}
      register={register}
    />
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
  const hint = field.description ? (
    <FieldDescription>{field.description}</FieldDescription>
  ) : null

  if (field.type === 'heading') {
    return (
      <div className="border-border/70 mt-1 flex flex-col gap-0.5 border-t pt-4 first:mt-0 first:border-t-0 first:pt-0">
        <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.08em] uppercase">
          {field.label}
        </p>
        {hint}
      </div>
    )
  }

  if (field.type === 'text') {
    return (
      <Field>
        <FieldLabel>{field.label}</FieldLabel>
        <Input {...register(name)} placeholder={field.placeholder} />
        {hint}
      </Field>
    )
  }

  if (field.type === 'datetime') {
    return (
      <Controller
        name={name}
        control={control}
        render={({ field: controllerField }) => (
          <Field>
            <FieldLabel>{field.label}</FieldLabel>
            <DateTimeField
              value={(controllerField.value as string) ?? ''}
              onChange={controllerField.onChange}
            />
            {hint}
          </Field>
        )}
      />
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
              aspect={field.aspect}
            />
            {hint}
          </Field>
        )}
      />
    )
  }

  if (field.type === 'textarea') {
    return (
      <Field>
        <FieldLabel>{field.label}</FieldLabel>
        <Textarea
          {...register(name)}
          rows={3}
          placeholder={field.placeholder}
        />
        {hint}
      </Field>
    )
  }

  if (field.type === 'color') {
    return (
      <Controller
        name={name}
        control={control}
        render={({ field: controllerField }) => {
          const value = (controllerField.value as string) ?? ''
          return (
            <Field>
              <FieldLabel>{field.label}</FieldLabel>
              <div className="flex items-center gap-2">
                <Input
                  type="color"
                  // A native colour input has no empty state, so an unset
                  // "inherit from the theme" field has to show *something*.
                  // Black would read as a deliberate choice; the theme accent
                  // is what the block actually paints with when unset.
                  value={value || '#111111'}
                  onChange={(event) =>
                    controllerField.onChange(event.target.value)
                  }
                  className="h-9 w-14 shrink-0 p-1"
                />
                {/* The text input is the accessible path to the value: a bare
                    <input type="color"> can't be typed into or pasted a hex
                    code — and it is the only way to clear one. */}
                <Input
                  value={value}
                  onChange={(event) =>
                    controllerField.onChange(event.target.value)
                  }
                  placeholder={field.allowEmpty ? 'Theme colour' : '#000000'}
                />
                {field.allowEmpty && value && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Reset ${field.label.toLowerCase()}`}
                    onClick={() => controllerField.onChange('')}
                  >
                    <RotateCcw className="size-3.5" />
                  </Button>
                )}
              </div>
              {hint}
            </Field>
          )
        }}
      />
    )
  }

  if (field.type === 'font') {
    return (
      <Controller
        name={name}
        control={control}
        render={({ field: controllerField }) => (
          <Field>
            <FieldLabel>{field.label}</FieldLabel>
            <FontPicker
              value={(controllerField.value as string) ?? ''}
              onValueChange={controllerField.onChange}
            />
            {hint}
          </Field>
        )}
      />
    )
  }

  if (field.type === 'number') {
    return (
      <Field>
        <FieldLabel>{field.label}</FieldLabel>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={field.min}
            max={field.max}
            step={field.step}
            // valueAsNumber keeps the stored content numeric; without it a
            // number input round-trips as a string and breaks the block's
            // arithmetic filters on the value.
            {...register(name, { valueAsNumber: true })}
          />
          {field.suffix && (
            <span className="text-muted-foreground shrink-0 text-xs">
              {field.suffix}
            </span>
          )}
        </div>
        {hint}
      </Field>
    )
  }

  if (field.type === 'product') {
    return <ProductField name={name} label={field.label} control={control} />
  }

  if (field.type === 'select') {
    return (
      <Controller
        name={name}
        control={control}
        render={({ field: controllerField }) => (
          <Field>
            <FieldLabel>{field.label}</FieldLabel>
            {/* Controlled, not `register`d. FormSelect is not a native
                <select>: it takes no ref, so react-hook-form had no way to
                write the stored value into it and every dropdown in the
                inspector opened showing its first option regardless of what
                the section actually held. */}
            <FormSelect
              value={(controllerField.value as string) ?? ''}
              onChange={(event) => controllerField.onChange(event.target.value)}
            >
              {field.options.map((option) => (
                <option key={optionValue(option)} value={optionValue(option)}>
                  {optionLabel(option)}
                </option>
              ))}
            </FormSelect>
            {hint}
          </Field>
        )}
      />
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
            <div className="flex flex-col gap-0.5">
              <FieldLabel>{field.label}</FieldLabel>
              {hint}
            </div>
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
              {itemFields.map((itemField) =>
                itemField.showWhen ? (
                  <ConditionalField
                    key={itemField.name}
                    field={itemField}
                    namePrefix={`${name}.${index}`}
                    control={control}
                    register={register}
                  />
                ) : (
                  <FieldRenderer
                    key={itemField.name}
                    field={itemField}
                    namePrefix={`${name}.${index}`}
                    control={control}
                    register={register}
                  />
                )
              )}
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
 * Shared by every field kind the registry declares, so each block gets the
 * same controls without a bespoke editor per type.
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
      {fields.map((field) =>
        field.showWhen ? (
          <ConditionalField
            key={field.name}
            field={field}
            namePrefix=""
            control={control}
            register={register}
          />
        ) : (
          <FieldRenderer
            key={field.name}
            field={field}
            namePrefix=""
            control={control}
            register={register}
          />
        )
      )}
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
