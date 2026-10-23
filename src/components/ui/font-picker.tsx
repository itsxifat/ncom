'use client'

import { useMemo, useRef, useState, type ReactNode } from 'react'
import { Combobox } from '@base-ui/react/combobox'
import {
  Check,
  ChevronsUpDown,
  LoaderCircle,
  Search,
  TriangleAlert,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import {
  detectScript,
  findFont,
  fontGroupsForScript,
  fontStack,
  isGoogleFamilyName,
  type FontScript,
} from '@/lib/fonts'
import { googleFamilyName } from '@/lib/font-stylesheet'
import {
  BANGLA_SPECIMEN,
  GOOGLE_CATEGORY_LABEL,
  loadGoogleFonts,
  matchesFontQuery,
  searchGoogleFonts,
  specimenStylesheetHref,
  useGoogleFonts,
  type GoogleFontList,
  type GoogleFontSummary,
} from '@/components/fonts/google-font-list'
import {
  useFontStylesheet,
  useSeen,
} from '@/components/fonts/use-font-stylesheet'

/**
 * The fallback line each font is set in, when there is no real text to use.
 * Chosen per script — a Bangla family has no glyphs for an English sentence
 * and would render the whole row from a fallback face, which is exactly the
 * thing this control exists to prevent.
 */
const SPECIMEN: Record<FontScript, string> = {
  latin: 'Handpicked for your store — 1,290',
  bangla: BANGLA_SPECIMEN,
}

/**
 * How many Google results are listed at once. Past this, a merchant is
 * scrolling rather than choosing, and typing one more letter is the faster
 * way to the font they have in mind.
 */
const GOOGLE_RESULT_LIMIT = 50

/**
 * The value of the "Browse all Google Fonts" row. Never a real choice — it is
 * caught before it reaches the form — and it cannot collide with one, since a
 * family name is only ever letters, digits and spaces.
 */
const BROWSE_GOOGLE = 'google-fonts:browse'

/**
 * The value of the "Theme font" row, offered where a font can be left to
 * whatever the element would otherwise inherit. Turned into an empty value
 * before it reaches the form, for the same reason as `BROWSE_GOOGLE`.
 */
const INHERIT = 'font-picker:inherit'

const GOOGLE_GROUP_LABEL = 'More from Google Fonts'

type ListGroup = {
  /** The heading; Base UI reads groups as `{ value, items }`. */
  value: string
  items: string[]
  kind: 'inherit' | 'in-use' | 'catalogue' | 'google' | 'browse'
  /** Catalogue groups: whether these faces can set the script being typed. */
  rendersScript?: boolean
}

/**
 * A font name as the storefront matches it: without regard to letter case or
 * repeated spaces. Themes saved before the picker existed hold whatever was
 * typed — "lexend", "hind siliguri" — and those render exactly like the
 * properly spelled names, so the picker has to treat them as the same font.
 */
function fontKey(name: string | null | undefined): string {
  return (name ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
}

/**
 * Which row is the chosen one. Ignores letter case for the reason above, so a
 * saved "lexend" still ticks the Lexend row; and the "Theme font" row stands
 * for no choice at all.
 */
function isSameFont(item: string | null, value: string | null): boolean {
  if (item === INHERIT) return !value
  return (
    item !== null && fontKey(item) !== '' && fontKey(item) === fontKey(value)
  )
}

/**
 * A stored name as the picker shows it: in the catalogue's or Google's own
 * spelling when it is one of theirs, otherwise exactly as it was saved.
 */
function displayName(name: string): string {
  return findFont(name)?.name ?? googleFamilyName(name) ?? name.trim()
}

/** Long copy makes every row the same illegible width; one line is the preview. */
function specimenFor(sampleText: string | undefined, script: FontScript) {
  const trimmed = sampleText?.trim().replace(/\s+/g, ' ')
  if (!trimmed) return SPECIMEN[script]
  return trimmed.length > 48 ? `${trimmed.slice(0, 48)}…` : trimmed
}

/**
 * Picks a storefront typeface: one of the self-hosted catalogue's families, or
 * any other family on Google Fonts.
 *
 * Replaces what used to be a free text box holding a family name. A typed name
 * had no way to be right: nothing validated it, nothing loaded it, and a
 * merchant only found out their heading font did not exist by looking at the
 * published page and seeing the default. Here every row is set in its own
 * face, so what the row looks like is what the storefront renders.
 *
 * The catalogue (see `lib/fonts.ts`) is what the list leads with: a curated
 * few dozen families, grouped by shape, that cover what most shops need. The
 * rest of Google Fonts is one search away, fetched only once someone searches
 * or asks to browse, and served through NCOM's own font proxy.
 *
 * Use it uncontrolled with a `name` to post with a plain form, or pass
 * `value`/`onValueChange` to drive it from form state.
 */
export function FontPicker({
  id,
  'aria-label': ariaLabel,
  name,
  value,
  defaultValue,
  onValueChange,
  disabled,
  className,
  size = 'default',
  inheritLabel,
  sampleText,
}: {
  id?: string
  /** Names the control where no `<label>` points at its `id`. */
  'aria-label'?: string
  /** Posts the chosen family name with the surrounding form. */
  name?: string
  value?: string
  defaultValue?: string
  onValueChange?: (font: string) => void
  disabled?: boolean
  className?: string
  /** `sm` for the builder's dense style panel and the toolbar on the canvas. */
  size?: 'default' | 'sm'
  /**
   * Offers a first row that clears the choice — an empty value — under this
   * name, such as "Theme font", and shows that name while nothing is chosen.
   * For a font that can be left to whatever the element would otherwise get.
   */
  inheritLabel?: string
  /**
   * The merchant's own words from the section being edited.
   *
   * Two jobs. It decides which script the list leads with, so a Bangla
   * headline is not shopped for among 65 Latin faces that cannot set it. And
   * it becomes the specimen every catalogue row is set in, so the preview
   * answers "what does *my* headline look like in this?" rather than "what
   * does a stock pangram look like?" — which is the only version of the
   * question a merchant is actually asking.
   */
  sampleText?: string
}) {
  const script = detectScript(sampleText)
  const catalogue = useMemo(() => fontGroupsForScript(script), [script])
  const specimen = specimenFor(sampleText, script)

  const [query, setQuery] = useState('')
  const [browsing, setBrowsing] = useState(false)
  const [banglaOnly, setBanglaOnly] = useState(false)
  // Holds the choice when the picker is uncontrolled, so the list can show a
  // Google family that is in use even though it is in none of the groups, and
  // so the combobox below can always be driven from here.
  const [chosen, setChosen] = useState(defaultValue ?? '')
  const selected = value ?? chosen

  const searching = query.trim() !== ''
  const google = useGoogleFonts(searching || browsing)

  const { groups, googleShown, googleTotal } = useMemo(() => {
    const result: ListGroup[] = []

    if (inheritLabel && !searching) {
      result.push({ kind: 'inherit', value: inheritLabel, items: [INHERIT] })
    }

    // A Google family outside the catalogue is in no group, so without this
    // the merchant would open the picker and find no sign of their own font.
    const inUse = !searching && isGoogleFamilyName(selected) ? selected : null
    if (inUse) result.push({ kind: 'in-use', value: 'In use', items: [inUse] })

    for (const group of catalogue) {
      if (banglaOnly && group.fonts[0]?.script !== 'bangla') continue
      const items = group.fonts
        .map((font) => font.name)
        .filter((font) => matchesFontQuery(font, query))
      if (items.length > 0) {
        result.push({
          kind: 'catalogue',
          value: group.label,
          items,
          rendersScript: group.rendersScript,
        })
      }
    }

    let googleShown = 0
    let googleTotal = 0
    if (google.status === 'ready' && (searching || browsing)) {
      const matches = searchGoogleFonts(google.fonts, query, {
        banglaOnly,
        banglaFirst: script === 'bangla',
        exclude: inUse,
      })
      googleTotal = matches.length
      const shown = matches.slice(0, GOOGLE_RESULT_LIMIT)
      googleShown = shown.length
      if (shown.length > 0) {
        result.push({
          kind: 'google',
          value: GOOGLE_GROUP_LABEL,
          items: shown.map((font) => font.family),
        })
      }
    }

    // Offered until the list is open, and again if fetching it failed.
    if ((!searching && !browsing) || google.status === 'error') {
      result.push({
        kind: 'browse',
        value: GOOGLE_GROUP_LABEL,
        items: [BROWSE_GOOGLE],
      })
    }

    return { groups: result, googleShown, googleTotal }
  }, [
    catalogue,
    query,
    searching,
    browsing,
    banglaOnly,
    selected,
    script,
    google,
    inheritLabel,
  ])

  // Keyed without regard to case, like every other step a font name goes
  // through: a saved "lexend" is Lexend to the proxy and to CSS, and must not
  // be reported as missing from Google Fonts here.
  const googleByFamily = useMemo(
    () => new Map(google.fonts.map((font) => [fontKey(font.family), font])),
    [google.fonts]
  )

  const googleLoading = google.status === 'loading' && (searching || browsing)
  const placeholder = inheritLabel ?? 'Choose a font'

  return (
    <Combobox.Root
      items={groups}
      // The list above is already filtered, catalogue and Google alike, so
      // the two can share one matching rule and one order.
      filter={null}
      onInputValueChange={(next) => setQuery(next)}
      name={name}
      // Always driven from here, controlled or not (`chosen` mirrors the
      // choice when uncontrolled): that is what lets the "Theme font" row
      // post an empty value instead of its own placeholder value.
      value={selected}
      isItemEqualToValue={isSameFont}
      disabled={disabled}
      onValueChange={(next, eventDetails) => {
        if (next === BROWSE_GOOGLE) {
          // Opens the Google section in place; the popup stays open and the
          // form never sees this row's value.
          eventDetails.cancel()
          setBrowsing(true)
          loadGoogleFonts()
          return
        }
        const font = typeof next === 'string' && next !== INHERIT ? next : ''
        setChosen(font)
        onValueChange?.(font)
      }}
    >
      <Combobox.Trigger
        id={id}
        aria-label={ariaLabel}
        className={cn(
          'border-input bg-card focus-visible:border-ring focus-visible:ring-ring/15 data-placeholder:text-muted-foreground dark:bg-input/30 flex h-10 w-full items-center justify-between gap-2 rounded-[0.875rem] border px-3.5 text-left text-sm transition-colors outline-none select-none focus-visible:ring-3 disabled:pointer-events-none disabled:opacity-50',
          size === 'sm' && 'h-8 gap-1 rounded-[0.625rem] px-2 text-xs',
          className
        )}
      >
        <Combobox.Value placeholder={placeholder}>
          {(current: string | null) => (
            <SelectedFont
              name={current}
              placeholder={placeholder}
              size={size}
            />
          )}
        </Combobox.Value>
        <Combobox.Icon
          render={
            <ChevronsUpDown
              className={cn(
                'text-muted-foreground shrink-0',
                size === 'sm' ? 'size-3.5' : 'size-4'
              )}
            />
          }
        />
      </Combobox.Trigger>

      <Combobox.Portal>
        <Combobox.Positioner
          sideOffset={4}
          align="start"
          className="isolate z-50"
        >
          <Combobox.Popup className="bg-popover text-popover-foreground ring-foreground/10 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 flex max-h-(--available-height) w-(--anchor-width) min-w-64 origin-(--transform-origin) flex-col overflow-hidden rounded-lg shadow-md ring-1 duration-100">
            <div className="border-border/60 relative border-b">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2" />
              <Combobox.Input
                aria-label="Search fonts"
                placeholder="Search all Google Fonts…"
                className="placeholder:text-muted-foreground h-10 w-full bg-transparent pr-3 pl-8.5 text-sm outline-none"
              />
            </div>
            {/* A toggle button drawn as a checkbox rather than a checkbox in a
                label: a label hands focus to its checkbox on every click, and
                this way a click leaves focus in the search box so a merchant
                can switch it on and carry on typing. Keyboard users Tab to it. */}
            <button
              type="button"
              aria-pressed={banglaOnly}
              onClick={() => setBanglaOnly((on) => !on)}
              onMouseDown={(event) => event.preventDefault()}
              className="border-border/60 text-muted-foreground hover:text-foreground focus-visible:ring-ring/25 flex w-full items-center gap-2 border-b px-3 py-2 text-left text-xs outline-none select-none focus-visible:ring-3 focus-visible:ring-inset"
            >
              <span
                aria-hidden
                className={cn(
                  'flex size-4 shrink-0 items-center justify-center rounded-[0.3rem] border transition-colors',
                  banglaOnly
                    ? 'bg-primary border-primary text-primary-foreground'
                    : 'border-input bg-card dark:bg-input/30'
                )}
              >
                {banglaOnly && <Check className="size-3 stroke-3" />}
              </span>
              Only fonts that can write Bangla
            </button>

            {/* Empty stays mounted so screen readers hear the count change, so
                the padding has to sit on the child that comes and goes — on the
                wrapper it would leave a gap above the list at all times. */}
            <Combobox.Empty>
              <p className="text-muted-foreground px-3 py-6 text-center text-sm">
                {googleLoading
                  ? 'Searching all of Google Fonts…'
                  : banglaOnly
                    ? 'No Bangla font matches that name.'
                    : 'No font matches that name.'}
              </p>
            </Combobox.Empty>

            <Combobox.List className="max-h-72 min-h-0 overflow-y-auto overscroll-contain p-1 data-empty:p-0">
              {(group: ListGroup) => (
                <Combobox.Group
                  key={`${group.kind}:${group.value}`}
                  items={group.items}
                  className="mb-1 last:mb-0"
                >
                  {/* The "Theme font" row names itself; a heading saying the
                      same above it would only push the fonts further down. */}
                  {group.kind !== 'inherit' && (
                    <Combobox.GroupLabel className="text-muted-foreground flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-medium tracking-wide uppercase">
                      {group.value}
                      {group.kind === 'catalogue' && !group.rendersScript && (
                        <span className="text-amber-600 normal-case dark:text-amber-500">
                          · no Bangla glyphs
                        </span>
                      )}
                    </Combobox.GroupLabel>
                  )}
                  <Combobox.Collection>
                    {(font: string) => {
                      if (group.kind === 'inherit') {
                        return <InheritRow key={font} label={group.value} />
                      }
                      if (group.kind === 'catalogue') {
                        return (
                          <FontRow
                            key={font}
                            name={font}
                            specimen={specimen}
                            unsupported={!group.rendersScript}
                          />
                        )
                      }
                      if (group.kind === 'browse') {
                        return (
                          <BrowseRow
                            key={font}
                            status={google.status}
                            count={google.fonts.length}
                          />
                        )
                      }
                      const info = googleByFamily.get(fontKey(font))
                      return (
                        <GoogleFontRow
                          key={font}
                          family={font}
                          info={info}
                          listStatus={google.status}
                          unsupported={
                            script === 'bangla' && !!info && !info.bangla
                          }
                        />
                      )
                    }}
                  </Combobox.Collection>
                </Combobox.Group>
              )}
            </Combobox.List>

            <PickerFooter
              loading={googleLoading}
              listEmpty={groups.length === 0}
              searching={searching}
              shown={googleShown}
              total={googleTotal}
              allBanglaAbove={
                banglaOnly &&
                browsing &&
                !searching &&
                google.status === 'ready' &&
                googleTotal === 0
              }
            />
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  )
}

/**
 * The closed control, set in the chosen face so a merchant scanning the
 * Design tab can see what their headings look like without opening anything.
 * A Google family is fetched here as well: it is in none of the catalogue's
 * bundled faces, and its name in a fallback face would look like a mistake.
 */
function SelectedFont({
  name,
  placeholder,
  size,
}: {
  name: string | null
  placeholder: string
  size: 'default' | 'sm'
}) {
  useFontStylesheet(name ? specimenStylesheetHref(name) : null)

  return (
    <span
      className={cn(
        'min-w-0 flex-1 truncate',
        size === 'default' && 'text-[15px]'
      )}
      style={name ? { fontFamily: fontStack(name) } : undefined}
    >
      {name ? displayName(name) : placeholder}
    </span>
  )
}

/** "Theme font": no font of its own, so the element keeps the one around it. */
function InheritRow({ label }: { label: string }) {
  return (
    <Combobox.Item
      value={INHERIT}
      className="data-highlighted:bg-accent data-highlighted:text-accent-foreground grid cursor-default grid-cols-[1rem_1fr] items-center gap-2.5 rounded-md px-2 py-1.5 outline-none select-none"
    >
      <Combobox.ItemIndicator className="col-start-1 flex items-center justify-center">
        <Check className="size-3.5" />
      </Combobox.ItemIndicator>
      <span className="col-start-2 min-w-0">
        <span className="block text-[15px] leading-tight font-medium">
          {label}
        </span>
        <span className="text-muted-foreground block truncate text-xs leading-snug">
          Same as the rest of the section
        </span>
      </span>
    </Combobox.Item>
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

/**
 * A Google family outside the catalogue.
 *
 * Its face is fetched only once the row has been on screen for a moment (see
 * `useSeen`), and only the letters it shows. A search for "a" matches over a
 * thousand families; fetching each one's preview as it matched would be
 * hundreds of requests per keystroke for rows nobody scrolled to.
 */
function GoogleFontRow({
  family,
  info,
  listStatus,
  unsupported,
}: {
  family: string
  /** Undefined until the list has loaded, or if Google has no such family. */
  info: GoogleFontSummary | undefined
  listStatus: GoogleFontList['status']
  unsupported: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const seen = useSeen(ref)
  useFontStylesheet(seen ? specimenStylesheetHref(family) : null)
  const face = fontStack(family)

  let detail: { text: string; inFace: boolean }
  if (info?.bangla) detail = { text: BANGLA_SPECIMEN, inFace: true }
  else if (info)
    detail = {
      text: GOOGLE_CATEGORY_LABEL[info.category] ?? 'Google Fonts',
      inFace: false,
    }
  else if (!googleFamilyName(family) || listStatus === 'ready')
    // A family saved before it left Google Fonts, or a name typed into the
    // old free-text box that was never on it ("Arial", "SolaimanLipi").
    // Usually known without the full list, from the names pages are checked
    // against (see lib/font-stylesheet). Nothing loads such a font, so only a
    // phone that happens to have it installed shows it.
    detail = {
      text: 'Not on Google Fonts, so most phones show a standard font instead',
      inFace: false,
    }
  // A Google family whose details come with the full list, which is fetched
  // only once someone searches. Until then, say no more than is known.
  else detail = { text: 'Your current font', inFace: false }

  return (
    <Combobox.Item
      ref={ref}
      value={family}
      className="data-highlighted:bg-accent data-highlighted:text-accent-foreground grid cursor-default grid-cols-[1rem_1fr] items-center gap-2.5 rounded-md px-2 py-1.5 outline-none select-none"
    >
      <Combobox.ItemIndicator className="col-start-1 flex items-center justify-center">
        <Check className="size-3.5" />
      </Combobox.ItemIndicator>
      <span className="col-start-2 min-w-0">
        <span className="flex items-center gap-1.5 text-[15px] leading-tight">
          <span className="min-w-0 truncate" style={{ fontFamily: face }}>
            {displayName(family)}
          </span>
          {info?.bangla && (
            <span className="bg-muted text-muted-foreground shrink-0 rounded px-1 py-px text-[10px] leading-none font-medium">
              Bangla
            </span>
          )}
          {unsupported && (
            <TriangleAlert
              aria-label="Cannot write Bangla"
              className="size-3 shrink-0 text-amber-600 dark:text-amber-500"
            />
          )}
        </span>
        <span
          className="text-muted-foreground block truncate text-xs leading-snug"
          style={detail.inFace ? { fontFamily: face } : undefined}
        >
          {detail.text}
        </span>
      </span>
    </Combobox.Item>
  )
}

/**
 * The row that opens the rest of Google Fonts. An item rather than a button
 * beside the list, so arrow keys reach it like any other row.
 */
function BrowseRow({
  status,
  count,
}: {
  status: GoogleFontList['status']
  count: number
}) {
  const failed = status === 'error'

  return (
    <Combobox.Item
      value={BROWSE_GOOGLE}
      className="data-highlighted:bg-accent data-highlighted:text-accent-foreground grid cursor-default grid-cols-[1rem_1fr] items-center gap-2.5 rounded-md px-2 py-1.5 outline-none select-none"
    >
      <span className="col-start-2 min-w-0">
        <span className="block text-[15px] leading-tight font-medium">
          {failed ? 'Could not load Google Fonts' : 'Browse all Google Fonts'}
        </span>
        <span className="text-muted-foreground block truncate text-xs leading-snug">
          {failed
            ? 'Check your connection, then choose this to try again'
            : count > 0
              ? `${count.toLocaleString('en')} more families`
              : 'Every other family on Google Fonts'}
        </span>
      </span>
    </Combobox.Item>
  )
}

function PickerFooter(props: {
  loading: boolean
  /** The list is empty, and `Combobox.Empty` is already saying why. */
  listEmpty: boolean
  searching: boolean
  shown: number
  total: number
  /** Browsing Bangla-only, and every such Google family is in the catalogue. */
  allBanglaAbove: boolean
}) {
  const message = footerMessage(props)

  return (
    <div
      aria-live="polite"
      // Collapsed rather than removed when there is nothing to say: a live
      // region has to be on the page before its text changes to be announced.
      className={cn(
        'text-muted-foreground border-border/60 flex items-center gap-2 text-xs',
        message && 'border-t px-3 py-2'
      )}
    >
      {message}
    </div>
  )
}

function footerMessage({
  loading,
  listEmpty,
  searching,
  shown,
  total,
  allBanglaAbove,
}: Parameters<typeof PickerFooter>[0]): ReactNode {
  if (listEmpty) return null
  if (loading) {
    return (
      <>
        <LoaderCircle className="size-3.5 shrink-0 animate-spin" />
        Loading all Google Fonts…
      </>
    )
  }
  const of = total.toLocaleString('en')
  if (total > shown) {
    return searching
      ? `Showing the ${shown} most used of ${of} matches. Keep typing to narrow it down.`
      : `Showing the ${shown} most used of ${of}. Search to find the rest.`
  }
  if (allBanglaAbove) {
    return 'Every Google font that can write Bangla is already listed above.'
  }
  return null
}
