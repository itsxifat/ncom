'use client'

import { useActionState, useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import {
  saveCollectionAction,
  type StoreActionState,
} from '@/app/(dashboard)/commerce-actions'
import { Card, CardContent } from '@/components/ui/card'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { SettingsSection } from '@/components/app/settings-section'
import { FormSelect } from '@/components/store/form-controls'
import { ProductMultiPicker } from '@/components/store/product-picker'
import type { PickerProduct } from '@/server/services/productService'

/**
 * Rule vocabulary, mirroring lib/validation/collection.ts.
 *
 * Kept as data rather than hardcoded markup so the dropdown cannot drift from
 * what the server accepts — a rule the UI offers but the schema rejects is a
 * save button that silently fails.
 */
const RULE_FIELDS = [
  { value: 'title', label: 'Product title', numeric: false },
  { value: 'productType', label: 'Product type', numeric: false },
  { value: 'vendor', label: 'Vendor', numeric: false },
  { value: 'tag', label: 'Tag', numeric: false },
  { value: 'price', label: 'Price', numeric: true },
  { value: 'inventoryQuantity', label: 'Stock', numeric: true },
  { value: 'weightGrams', label: 'Weight (g)', numeric: true },
] as const

const TEXT_OPERATORS = [
  { value: 'equals', label: 'is exactly' },
  { value: 'notEquals', label: 'is not' },
  { value: 'contains', label: 'contains' },
  { value: 'notContains', label: 'does not contain' },
  { value: 'startsWith', label: 'starts with' },
  { value: 'endsWith', label: 'ends with' },
] as const

const NUMERIC_OPERATORS = [
  { value: 'equals', label: 'is equal to' },
  { value: 'greaterThan', label: 'is greater than' },
  { value: 'lessThan', label: 'is less than' },
] as const

interface RuleDraft {
  field: string
  operator: string
  value: string
}

export interface CollectionFormInitial {
  id?: string
  title: string
  handle: string
  description: string
  type: 'MANUAL' | 'AUTOMATED'
  rulesMatch: 'ALL' | 'ANY'
  sortOrder: string
  rules: RuleDraft[]
  productIds: string[]
  seoTitle: string
  seoDescription: string
}

export function CollectionForm({
  initial,
  products,
  productsCursor = null,
  productsTotal = null,
  currencyCode,
}: {
  initial: CollectionFormInitial
  /** The first page of the catalogue; the picker fetches the rest as needed. */
  products: PickerProduct[]
  productsCursor?: string | null
  productsTotal?: number | null
  currencyCode: string
}) {
  const boundAction = saveCollectionAction.bind(null, initial.id ?? null)
  const [state, action, pending] = useActionState<StoreActionState, FormData>(
    boundAction,
    undefined
  )

  const [title, setTitle] = useState(initial.title)
  const [handle, setHandle] = useState(initial.handle)
  const [description, setDescription] = useState(initial.description)
  const [type, setType] = useState(initial.type)
  const [rulesMatch, setRulesMatch] = useState(initial.rulesMatch)
  const [sortOrder, setSortOrder] = useState(initial.sortOrder)
  const [rules, setRules] = useState<RuleDraft[]>(initial.rules)
  const [productIds, setProductIds] = useState<string[]>(initial.productIds)
  const [seoTitle, setSeoTitle] = useState(initial.seoTitle)
  const [seoDescription, setSeoDescription] = useState(initial.seoDescription)

  const payload = useMemo(
    () =>
      JSON.stringify({
        title,
        handle: handle || undefined,
        description,
        type,
        rulesMatch,
        sortOrder,
        rules:
          type === 'AUTOMATED' ? rules.filter((rule) => rule.value !== '') : [],
        productIds: type === 'MANUAL' ? productIds : [],
        seoTitle,
        seoDescription,
      }),
    [
      title,
      handle,
      description,
      type,
      rulesMatch,
      sortOrder,
      rules,
      productIds,
      seoTitle,
      seoDescription,
    ]
  )

  function updateRule(index: number, patch: Partial<RuleDraft>) {
    setRules((current) =>
      current.map((rule, i) => (i === index ? { ...rule, ...patch } : rule))
    )
  }

  return (
    <form action={action} className="flex flex-col gap-10">
      <input type="hidden" name="payload" value={payload} />

      <SettingsSection title="Details">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="title">Title</FieldLabel>
            <Input
              id="title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="handle">URL handle</FieldLabel>
            <Input
              id="handle"
              value={handle}
              onChange={(event) => setHandle(event.target.value)}
              placeholder="Generated from the title"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="description">Description</FieldLabel>
            <Textarea
              id="description"
              rows={4}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </Field>
        </FieldGroup>
      </SettingsSection>

      <SettingsSection
        title="Products"
        description="Pick products by hand, or let rules decide which ones belong."
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="type">How products are chosen</FieldLabel>
            <FormSelect
              id="type"
              value={type}
              onChange={(event) =>
                setType(event.target.value as 'MANUAL' | 'AUTOMATED')
              }
            >
              <option value="MANUAL">Chosen by hand</option>
              <option value="AUTOMATED">Matched by rules</option>
            </FormSelect>
          </Field>

          {type === 'AUTOMATED' ? (
            <>
              <Field>
                <FieldLabel htmlFor="rulesMatch">Match</FieldLabel>
                <FormSelect
                  id="rulesMatch"
                  value={rulesMatch}
                  onChange={(event) =>
                    setRulesMatch(event.target.value as 'ALL' | 'ANY')
                  }
                >
                  <option value="ALL">Products matching all rules</option>
                  <option value="ANY">Products matching any rule</option>
                </FormSelect>
              </Field>

              {rules.map((rule, index) => {
                const fieldMeta = RULE_FIELDS.find(
                  (candidate) => candidate.value === rule.field
                )
                const operators = fieldMeta?.numeric
                  ? NUMERIC_OPERATORS
                  : TEXT_OPERATORS

                return (
                  <div key={index} className="flex flex-wrap items-end gap-2">
                    <FormSelect
                      value={rule.field}
                      aria-label="Field"
                      onChange={(event) => {
                        const nextField = event.target.value
                        const nextMeta = RULE_FIELDS.find(
                          (candidate) => candidate.value === nextField
                        )
                        // Switching between a text and a numeric field can
                        // orphan the operator ("contains" on a price), so reset
                        // it to the first valid one for the new field.
                        const validOperators = nextMeta?.numeric
                          ? NUMERIC_OPERATORS
                          : TEXT_OPERATORS
                        const stillValid = validOperators.some(
                          (candidate) => candidate.value === rule.operator
                        )
                        updateRule(index, {
                          field: nextField,
                          operator: stillValid
                            ? rule.operator
                            : validOperators[0].value,
                        })
                      }}
                    >
                      {RULE_FIELDS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </FormSelect>

                    <FormSelect
                      value={rule.operator}
                      aria-label="Operator"
                      onChange={(event) =>
                        updateRule(index, { operator: event.target.value })
                      }
                    >
                      {operators.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </FormSelect>

                    <Input
                      value={rule.value}
                      aria-label="Value"
                      placeholder={fieldMeta?.numeric ? '1000' : 'summer'}
                      onChange={(event) =>
                        updateRule(index, { value: event.target.value })
                      }
                      className="w-40"
                    />

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Remove rule"
                      onClick={() =>
                        setRules(rules.filter((_, i) => i !== index))
                      }
                    >
                      <Trash2 />
                    </Button>
                  </div>
                )
              })}

              <Field>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    setRules([
                      ...rules,
                      { field: 'title', operator: 'contains', value: '' },
                    ])
                  }
                >
                  <Plus />
                  Add rule
                </Button>
                <FieldDescription>
                  Prices and weights are entered in whole units — cents for
                  price, grams for weight.
                </FieldDescription>
              </Field>
            </>
          ) : (
            <Field>
              <FieldLabel>Products in this collection</FieldLabel>
              <ProductMultiPicker
                initialProducts={products}
                initialCursor={productsCursor}
                total={productsTotal}
                currencyCode={currencyCode}
                selectedIds={productIds}
                onChange={setProductIds}
                emptyLabel="No products yet — add one under Products first."
              />
            </Field>
          )}

          <Field>
            <FieldLabel htmlFor="sortOrder">Sort products by</FieldLabel>
            <FormSelect
              id="sortOrder"
              value={sortOrder}
              onChange={(event) => setSortOrder(event.target.value)}
            >
              <option value="MANUAL">Manual</option>
              <option value="TITLE_ASC">Title A–Z</option>
              <option value="TITLE_DESC">Title Z–A</option>
              <option value="CREATED_DESC">Newest first</option>
              <option value="CREATED_ASC">Oldest first</option>
              <option value="PRICE_ASC">Price low to high</option>
              <option value="PRICE_DESC">Price high to low</option>
              <option value="BEST_SELLING">Best selling</option>
            </FormSelect>
            <FieldDescription>
              Price and best-selling ordering are not implemented yet and fall
              back to newest first.
            </FieldDescription>
          </Field>
        </FieldGroup>
      </SettingsSection>

      <SettingsSection title="Search engine listing">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="seoTitle">Page title</FieldLabel>
            <Input
              id="seoTitle"
              value={seoTitle}
              onChange={(event) => setSeoTitle(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="seoDescription">Meta description</FieldLabel>
            <Textarea
              id="seoDescription"
              rows={3}
              value={seoDescription}
              onChange={(event) => setSeoDescription(event.target.value)}
            />
          </Field>
        </FieldGroup>
      </SettingsSection>

      <Card>
        <CardContent>
          <FieldGroup>
            {state?.error && <FieldError>{state.error}</FieldError>}
            {state?.success && (
              <p className="text-muted-foreground text-sm">{state.success}</p>
            )}
            <Field>
              <Button type="submit" disabled={pending}>
                {pending
                  ? 'Saving…'
                  : initial.id
                    ? 'Save collection'
                    : 'Create collection'}
              </Button>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>
    </form>
  )
}
