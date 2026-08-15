'use client'

import { useMemo } from 'react'
import { Combobox } from '@base-ui/react/combobox'
import { Check, ChevronsUpDown, Search, TriangleAlert } from 'lucide-react'

import { cn } from '@/lib/utils'
import {
  FONT_OPTIONS,
  detectScript,
  findFont,
  fontGroupsForScript,
  fontStack,
  type FontScript,
} from '@/lib/fonts'

/**
 * The fallback line each font is set in, when there is no real text to use.
 * Chosen per script — a Bangla family has no glyphs for an English sentence
 * and would render the whole row from a fallback face, which is exactly the
 * thing this control exists to prevent.
 */
const SPECIMEN: Record<FontScript, string> = {
  latin: 'Handpicked for your store — 1,290',
  bangla: 'আপনার দোকানের জন্য বাছাই করা — ১,২৯০',
}

const FONT_COUNT = FONT_OPTIONS.length

/** Long copy makes every row the same illegible width; one line is the preview. */
function specimenFor(sampleText: string | undefined, script: FontScript) {
  const trimmed = sampleText?.trim().replace(/\s+/g, ' ')
  if (!trimmed) return SPECIMEN[script]
  return trimmed.length > 48 ? `${trimmed.slice(0, 48)}…` : trimmed
}

/**
 * Picks a storefront typeface from the fonts this app can actually serve.
 *
 * Replaces what used to be a free text box holding a family name. A typed name
 * had no way to be right: nothing validated it, nothing loaded it, and a
 * merchant only found out their heading font did not exist by looking at the
 * published page and seeing the default. Every entry here is self-hosted (see
 * `lib/fonts.ts`), so what the row is set in is what the storefront renders.
 *
 * Use it uncontrolled with a `name` to post with a plain form, or pass
 * `value`/`onValueChange` to drive it from form state.
 */
export function FontPicker({
  id,
  name,
  value,
  defaultValue,
  onValueChange,
  disabled,
  className,
  sampleText,
}: {
  id?: string
  /** Posts the chosen family name with the surrounding form. */
  name?: string
  value?: string
  defaultValue?: string
  onValueChange?: (font: string) => void
  disabled?: boolean
  className?: string
  /**
   * The merchant's own words from the section being edited.
   *
   * Two jobs. It decides which script the list leads with, so a Bangla
   * headline is not shopped for among 65 Latin faces that cannot set it. And
   * it becomes the specimen every row is set in, so the preview answers "what
   * does *my* headline look like in this?" rather than "what does a stock
   * pangram look like?" — which is the only version of the question a merchant
   * is actually asking.
   */
  sampleText?: string
}) {
  const script = detectScript(sampleText)
  const groups = useMemo(() => fontGroupsForScript(script), [script])
  const specimen = specimenFor(sampleText, script)

  /** Base UI groups items as `{ value: heading, items: [...] }`. */
  const items = useMemo(
    () =>
      groups.map((group) => ({
        value: group.label,
        items: group.fonts.map((font) => font.name),
      })),
    [groups]
  )

  const unsupported = useMemo(
    () =>
      new Set(
        groups
          .filter((group) => !group.rendersScript)
          .flatMap((group) => group.fonts.map((font) => font.name))
      ),
    [groups]
  )

  return (
    <Combobox.Root
      items={items}
      name={name}
      value={value}
      defaultValue={defaultValue}
      disabled={disabled}
      onValueChange={(next) =>
        onValueChange?.(typeof next === 'string' ? next : '')
      }
    >
      <Combobox.Trigger
        id={id}
        className={cn(
          'border-input bg-card focus-visible:border-ring focus-visible:ring-ring/15 data-placeholder:text-muted-foreground dark:bg-input/30 flex h-10 w-full items-center justify-between gap-2 rounded-[0.875rem] border px-3.5 text-left text-sm transition-colors outline-none select-none focus-visible:ring-3 disabled:pointer-events-none disabled:opacity-50',
          className
        )}
      >
        <Combobox.Value placeholder="Choose a font">
          {(selected: string | null) => (
            <span
              className="min-w-0 flex-1 truncate text-[15px]"
              // Set in the face itself, so the closed control is already a
              // preview and a merchant scanning the Design tab can see what
              // their headings look like without opening anything.
              style={{ fontFamily: fontStack(selected) }}
            >
              {selected || 'Choose a font'}
            </span>
          )}
        </Combobox.Value>
        <Combobox.Icon
          render={
            <ChevronsUpDown className="text-muted-foreground size-4 shrink-0" />
          }
        />
      </Combobox.Trigger>

      <Combobox.Portal>
        <Combobox.Positioner
          sideOffset={4}
          align="start"
          className="isolate z-50"
        >
          <Combobox.Popup className="bg-popover text-popover-foreground ring-foreground/10 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 max-h-(--available-height) w-(--anchor-width) min-w-64 origin-(--transform-origin) overflow-hidden rounded-lg shadow-md ring-1 duration-100">
            <div className="border-border/60 relative border-b">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2" />
              <Combobox.Input
                placeholder={`Search ${FONT_COUNT} fonts…`}
                className="placeholder:text-muted-foreground h-10 w-full bg-transparent pr-3 pl-8.5 text-sm outline-none"
              />
            </div>

            {/* Empty stays mounted so screen readers hear the count change, so
                the padding has to sit on the child that comes and goes — on the
                wrapper it would leave a gap above the list at all times. */}
            <Combobox.Empty>
              <p className="text-muted-foreground px-3 py-6 text-center text-sm">
                No font matches that name.
              </p>
            </Combobox.Empty>

            <Combobox.List className="max-h-72 overflow-y-auto overscroll-contain p-1 data-empty:p-0">
              {(group: { value: string; items: string[] }) => (
                <Combobox.Group
                  key={group.value}
                  items={group.items}
                  className="mb-1 last:mb-0"
                >
                  <Combobox.GroupLabel className="text-muted-foreground flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-medium tracking-wide uppercase">
                    {group.value}
                    {unsupported.has(group.items[0] ?? '') && (
                      <span className="text-amber-600 normal-case dark:text-amber-500">
                        · no Bangla glyphs
                      </span>
                    )}
                  </Combobox.GroupLabel>
                  <Combobox.Collection>
                    {(font: string) => (
                      <FontRow
                        key={font}
                        name={font}
                        specimen={specimen}
                        unsupported={unsupported.has(font)}
                      />
                    )}
                  </Combobox.Collection>
                </Combobox.Group>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  )
}

function FontRow({
  name,
  specimen,
  unsupported,
}: {
  name: string
  specimen: string
  /** True when this face has no glyphs for the script the merchant is typing. */
  unsupported: boolean
}) {
  const option = findFont(name)
  const family = option?.stack

  return (
    <Combobox.Item
      value={name}
      className="data-highlighted:bg-accent data-highlighted:text-accent-foreground grid cursor-default grid-cols-[1rem_1fr] items-center gap-2.5 rounded-md px-2 py-1.5 outline-none select-none"
    >
      <Combobox.ItemIndicator className="col-start-1 flex items-center justify-center">
        <Check className="size-3.5" />
      </Combobox.ItemIndicator>
      <span className="col-start-2 min-w-0">
        <span
          className="flex items-center gap-1.5 text-[15px] leading-tight"
          style={{ fontFamily: family }}
        >
          <span className="min-w-0 truncate">{name}</span>
          {unsupported && (
            <TriangleAlert className="size-3 shrink-0 text-amber-600 dark:text-amber-500" />
          )}
        </span>
        <span
          className="text-muted-foreground block truncate text-xs leading-snug"
          // The specimen is the merchant's own text where there is any, so a
          // face that cannot set it visibly falls back here rather than
          // looking fine until the page is published.
          style={{ fontFamily: family }}
        >
          {specimen}
        </span>
      </span>
    </Combobox.Item>
  )
}
