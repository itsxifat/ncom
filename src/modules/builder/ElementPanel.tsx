'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, Search, Trash2 } from 'lucide-react'

import { useBuilderStore } from './store'
import { parseElementKey } from './canvasBridge'
import { ElementStylePanel } from './ElementStylePanel'
import { getSectionDefinition } from '../sections/registry'
import { sectionExtras } from '../sections/elements'
import {
  EXTRA_ELEMENT_TYPES,
  ICON_NAMES,
  extraDescriptor,
  extraKey,
  type ElementDescriptor,
  type ExtraElementType,
} from '../sections/elementDescriptors'
import { ImagePicker } from './ImagePicker'
import { RichTextEditor } from '@/components/ui/rich-text-editor'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FieldLabel } from '@/components/ui/field'
import { FormSelect } from '@/components/ui/form-select'
import { cn } from '@/lib/utils'

/**
 * The Elements tab: what this block is made of, and how each piece looks.
 *
 * Two views in one panel. With nothing selected it is a list — every element
 * the block draws, plus every element the merchant has added — which is the
 * answer to "what can I even change here?" that a canvas alone cannot give,
 * because an element with no background and no text is invisible until you
 * happen to click it.
 *
 * With something selected it becomes that element's editor. Selecting from the
 * list and selecting on the canvas are the same action and share one piece of
 * state, so the two views can never disagree about what is being edited.
 */
export function ElementPanel() {
  const sectionId = useBuilderStore((s) => s.selectedSectionId)
  const elementKey = useBuilderStore((s) => s.selectedElementKey)
  const section = useBuilderStore((s) =>
    s.sections.find((candidate) => candidate.id === s.selectedSectionId)
  )
  const path = useBuilderStore((s) => s.selectedPath)
  const selectElement = useBuilderStore((s) => s.selectElement)
  const addExtraElement = useBuilderStore((s) => s.addExtraElement)
  const removeExtraElement = useBuilderStore((s) => s.removeExtraElement)

  const [adding, setAdding] = useState(false)
  const [filter, setFilter] = useState('')

  if (!section || !sectionId) {
    return (
      <p className="text-muted-foreground px-2 py-8 text-center text-sm">
        Select a section to see what it is made of.
      </p>
    )
  }

  const definition = getSectionDefinition(section.type)
  const extras = sectionExtras(section.config)

  /**
   * Whether an element carries any styling, counting per-instance overrides.
   *
   * A repeated element styled only as `card#2` has no `card` entry, so a plain
   * lookup would show it as untouched — and the merchant would have no way to
   * find the one card they restyled last week except by clicking all nine.
   */
  const isStyled = (key: string) =>
    Object.keys(section.config?.elements ?? {}).some(
      (styled) => styled === key || styled.startsWith(`${key}#`)
    )
  const builtIn = definition?.elements ?? []
  const added = extras.map(extraDescriptor)
  const slots = definition?.slots ?? [{ key: 'content', label: 'This block' }]

  const labelFor = (key: string) =>
    builtIn.find((element) => element.key === key)?.label ??
    added.find((element) => element.key === key)?.label ??
    key

  if (elementKey) {
    const { base, index } = parseElementKey(elementKey)
    const descriptor =
      builtIn.find((element) => element.key === base) ??
      added.find((element) => element.key === base)
    const extra = base.startsWith('x:')
      ? extras.find((candidate) => extraKey(candidate.id) === base)
      : undefined

    return (
      <div className="flex flex-col gap-3">
        {/* The path back out. A click on the page lands on the innermost thing
            under the pointer, which is right most of the time and one level too
            deep the rest — this is how a merchant who meant the card gets to
            the card. */}
        <nav className="text-muted-foreground flex flex-wrap items-center gap-0.5 text-[11px]">
          <button
            type="button"
            onClick={() => selectElement(sectionId, null)}
            className="hover:text-foreground flex items-center gap-1"
          >
            <ChevronLeft className="size-3" /> All
          </button>
          {path.map((step, stepIndex) => (
            <span key={`${step.elementKey}-${stepIndex}`} className="contents">
              <ChevronRight className="size-3 opacity-40" />
              <button
                type="button"
                onClick={() =>
                  selectElement(
                    sectionId,
                    step.elementKey,
                    path.slice(0, stepIndex)
                  )
                }
                className="hover:text-foreground max-w-24 truncate"
              >
                {labelFor(step.elementKey)}
              </button>
            </span>
          ))}
          <ChevronRight className="size-3 opacity-40" />
          <span className="text-foreground max-w-28 truncate font-medium">
            {descriptor?.label ?? base}
          </span>
        </nav>

        {extra && (
          <ExtraContentFields sectionId={sectionId} extraId={extra.id} />
        )}

        {index !== undefined && (
          <p className="text-muted-foreground rounded-md bg-blue-500/10 px-2 py-1.5 text-[10px] leading-relaxed">
            Styling <strong>item {index + 1}</strong> only. Everything else in
            this list keeps the shared style.
          </p>
        )}

        <ElementStylePanel
          sectionId={sectionId}
          elementKey={elementKey}
          kind={descriptor?.kind ?? 'container'}
          label={
            descriptor
              ? index !== undefined
                ? `${descriptor.label} ${index + 1}`
                : descriptor.label
              : base
          }
        />
      </div>
    )
  }

  const needle = filter.trim().toLowerCase()
  const matches = (element: ElementDescriptor) =>
    !needle ||
    element.label.toLowerCase().includes(needle) ||
    element.key.toLowerCase().includes(needle)
  const visible = builtIn.filter(matches)

  return (
    <div className="flex flex-col gap-4">
      {/* A block with a handful of parts is a list you read; the order form has
          fifty, and a list that long is one you search. The box appears when it
          starts earning its place rather than sitting on every block. */}
      {builtIn.length > 12 && (
        <div className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
          <Input
            value={filter}
            placeholder={`Find one of ${builtIn.length} parts…`}
            onChange={(event) => setFilter(event.target.value)}
            className="h-8 pl-8 text-xs"
          />
        </div>
      )}

      <section className="flex flex-col gap-1.5">
        <h4 className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
          In this block
        </h4>
        {builtIn.length === 0 ? (
          <p className="text-muted-foreground text-xs">
            This block has no individually styleable parts yet.
          </p>
        ) : visible.length === 0 ? (
          <p className="text-muted-foreground text-xs">
            Nothing here is called “{filter.trim()}”.
          </p>
        ) : (
          visible.map((element) => (
            <ElementRow
              key={element.key}
              element={element}
              onSelect={() => selectElement(sectionId, element.key)}
              styled={isStyled(element.key)}
            />
          ))
        )}
      </section>

      {added.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <h4 className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
            Added
          </h4>
          {added.map((element) => (
            <ElementRow
              key={element.key}
              element={element}
              onSelect={() => selectElement(sectionId, element.key)}
              styled={isStyled(element.key)}
              onRemove={() =>
                removeExtraElement(sectionId, element.key.slice(2))
              }
            />
          ))}
        </section>
      )}

      {adding ? (
        <section className="flex flex-col gap-2 rounded-lg border p-2.5">
          <p className="text-xs font-medium">Add an element</p>
          {slots.length > 1 && (
            <p className="text-muted-foreground text-[10px]">
              Choose where it goes, then what it is.
            </p>
          )}
          {slots.map((slot) => (
            <div key={slot.key} className="flex flex-col gap-1">
              {slots.length > 1 && (
                <span className="text-muted-foreground text-[10px]">
                  {slot.label}
                </span>
              )}
              <div className="flex flex-wrap gap-1">
                {EXTRA_ELEMENT_TYPES.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      addExtraElement(sectionId, type, slot.key)
                      setAdding(false)
                    }}
                    className="hover:bg-accent rounded-md border px-2 py-1 text-[11px] capitalize"
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setAdding(false)}
          >
            Cancel
          </Button>
        </section>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setAdding(true)}
        >
          <Plus className="size-3.5" /> Add an element
        </Button>
      )}
    </div>
  )
}

function ElementRow({
  element,
  onSelect,
  styled,
  onRemove,
}: {
  element: ElementDescriptor
  onSelect: () => void
  /** Whether this element carries any styling, so the list can show it. */
  styled: boolean
  onRemove?: () => void
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={onSelect}
        className="hover:bg-accent flex flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs"
      >
        <span
          className={cn(
            'size-1.5 shrink-0 rounded-full',
            styled ? 'bg-primary' : 'bg-muted-foreground/30'
          )}
          title={styled ? 'Has custom styling' : 'Following the theme'}
        />
        <span className="flex-1 truncate">{element.label}</span>
        <span className="text-muted-foreground text-[10px] capitalize">
          {element.repeated ? 'list' : element.kind}
        </span>
      </button>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          title="Delete element"
          className="text-muted-foreground hover:text-destructive p-1"
        >
          <Trash2 className="size-3.5" />
        </button>
      )}
    </div>
  )
}

/**
 * What an added element actually says or shows.
 *
 * Built-in elements draw from the block's content fields, edited in the Content
 * tab. An added element has nowhere else to be edited, so its content lives
 * here, next to its styling.
 */
function ExtraContentFields({
  sectionId,
  extraId,
}: {
  sectionId: string
  extraId: string
}) {
  const extra = useBuilderStore((s) =>
    sectionExtras(
      s.sections.find((section) => section.id === sectionId)?.config
    ).find((candidate) => candidate.id === extraId)
  )
  const updateExtraElement = useBuilderStore((s) => s.updateExtraElement)

  if (!extra) return null

  const set = (patch: Parameters<typeof updateExtraElement>[2]) =>
    updateExtraElement(sectionId, extraId, patch)

  const carriesText: ExtraElementType[] = ['heading', 'text', 'button']

  return (
    <div className="flex flex-col gap-2.5 rounded-lg border p-2.5">
      {carriesText.includes(extra.type) && (
        <Field>
          <FieldLabel>Text</FieldLabel>
          <RichTextEditor
            value={extra.html}
            onChange={(html) => set({ html })}
            multiline={extra.type === 'text'}
          />
        </Field>
      )}

      {extra.type === 'button' && (
        <Field>
          <FieldLabel>Links to</FieldLabel>
          <Input
            value={extra.href}
            placeholder="#order"
            onChange={(event) => set({ href: event.target.value })}
            className="h-8 text-xs"
          />
        </Field>
      )}

      {extra.type === 'image' && (
        <>
          <Field>
            <FieldLabel>Image</FieldLabel>
            <ImagePicker value={extra.src} onChange={(src) => set({ src })} />
          </Field>
          <Field>
            <FieldLabel>Alt text</FieldLabel>
            <Input
              value={extra.alt}
              placeholder="What the picture shows"
              onChange={(event) => set({ alt: event.target.value })}
              className="h-8 text-xs"
            />
          </Field>
        </>
      )}

      {extra.type === 'icon' && (
        <Field>
          <FieldLabel>Icon</FieldLabel>
          <FormSelect
            value={extra.icon}
            onChange={(event) => set({ icon: event.target.value })}
            className="border-input bg-card h-8 rounded-[0.625rem] border px-2 text-xs"
          >
            {ICON_NAMES.map((name) => (
              <option key={name} value={name}>
                {name.replace(/-/g, ' ')}
              </option>
            ))}
          </FormSelect>
        </Field>
      )}
    </div>
  )
}
