'use client'

import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { Check, Languages } from 'lucide-react'
import type { PageTheme } from '../sections/types'
import {
  SITE_LANGUAGE_LABELS,
  siteLanguage,
  siteNumerals,
  type SiteLanguage,
  type SiteNumerals,
} from '../sections/language'
import { useBuilderStore } from './store'
import { ImagePicker } from './ImagePicker'
import { ColorField } from '@/components/ui/color-picker'
import { FontPicker } from '@/components/ui/font-picker'
import { Field, FieldLabel, FieldDescription } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'
import { findFont, fontStack } from '@/lib/fonts'
import { cn } from '@/lib/utils'

/**
 * The whole site's look, from inside the builder.
 *
 * Colours and fonts are where a merchant makes a template theirs, and a list
 * of hex fields is where most of them give up. So the panel leads with choices
 * made for them — palettes that already work together, font pairings that
 * already suit each other — and keeps the individual controls underneath for
 * the merchant who knows exactly which green their brand is.
 *
 * Every change paints the canvas at once and is saved as the working theme;
 * the live site keeps its theme until Publish.
 */

interface Palette {
  name: string
  primaryColor: string
  secondaryColor: string
  backgroundColor: string
  textColor: string
}

const PALETTES: Palette[] = [
  {
    name: 'Ink',
    primaryColor: '#111111',
    secondaryColor: '#f59f00',
    backgroundColor: '#ffffff',
    textColor: '#1b1b1f',
  },
  {
    name: 'Ocean',
    primaryColor: '#1d4ed8',
    secondaryColor: '#0ea5e9',
    backgroundColor: '#ffffff',
    textColor: '#0f172a',
  },
  {
    name: 'Forest',
    primaryColor: '#2f7d32',
    secondaryColor: '#f5b301',
    backgroundColor: '#ffffff',
    textColor: '#1f2a1f',
  },
  {
    name: 'Sunset',
    primaryColor: '#e8590c',
    secondaryColor: '#2f9e44',
    backgroundColor: '#fffaf5',
    textColor: '#2b1a12',
  },
  {
    name: 'Rose',
    primaryColor: '#c2577a',
    secondaryColor: '#e9b8a8',
    backgroundColor: '#fdf6f4',
    textColor: '#3b2a2a',
  },
  {
    name: 'Royal',
    primaryColor: '#6d28d9',
    secondaryColor: '#f59e0b',
    backgroundColor: '#ffffff',
    textColor: '#1e1b2e',
  },
  {
    name: 'Sand',
    primaryColor: '#2b2118',
    secondaryColor: '#b08d57',
    backgroundColor: '#faf7f2',
    textColor: '#2b2118',
  },
  {
    name: 'Mint',
    primaryColor: '#0f766e',
    secondaryColor: '#f97316',
    backgroundColor: '#f0fdfa',
    textColor: '#134e4a',
  },
  {
    name: 'Cherry',
    primaryColor: '#e03131',
    secondaryColor: '#f08c00',
    backgroundColor: '#fff8f1',
    textColor: '#2b1a12',
  },
  {
    name: 'Lavender',
    primaryColor: '#7c3aed',
    secondaryColor: '#f472b6',
    backgroundColor: '#faf5ff',
    textColor: '#2e1065',
  },
  {
    name: 'Midnight',
    primaryColor: '#4f8cff',
    secondaryColor: '#22d3a6',
    backgroundColor: '#0d1015',
    textColor: '#e8ebf1',
  },
  {
    name: 'Charcoal',
    primaryColor: '#fbbf24',
    secondaryColor: '#f472b6',
    backgroundColor: '#18181b',
    textColor: '#f4f4f5',
  },
]

interface Pairing {
  name: string
  heading: string
  body: string
  /** Both faces set Bangla — offered first on a Bangla site. */
  bangla?: boolean
}

const PAIRINGS: Pairing[] = [
  { name: 'Modern', heading: 'Plus Jakarta Sans', body: 'Inter' },
  { name: 'Clean', heading: 'Inter', body: 'Inter' },
  { name: 'Elegant', heading: 'Cormorant Garamond', body: 'Manrope' },
  { name: 'Classic', heading: 'Playfair Display', body: 'DM Sans' },
  { name: 'Friendly', heading: 'Poppins', body: 'Nunito' },
  { name: 'Techy', heading: 'Space Grotesk', body: 'Inter' },
  // Google Sans text, which sets Bangla and English in one face, for a shop
  // that writes in both. A Bangla face here (it was Hind Siliguri) would draw
  // the Bangla itself and skip the Google Sans default. It is also the Flash
  // sale template's English pair, so that page finds it ticked.
  { name: 'Bold', heading: 'Montserrat', body: 'Google Sans' },
  // Google Sans leads and sets every Bangla body: its Bangla and Latin letters
  // were drawn together, so a Bangla line with an English product name or a
  // price in it reads as one typeface. The headings vary the character. The
  // first and "Bangla elegant" are also what the templates use in Bangla, so
  // a fresh Bangla site finds its own fonts already ticked here.
  {
    name: 'Bangla',
    heading: 'Google Sans',
    body: 'Google Sans',
    bangla: true,
  },
  {
    name: 'Bangla elegant',
    heading: 'Noto Serif Bengali',
    body: 'Google Sans',
    bangla: true,
  },
  {
    name: 'Bangla modern',
    heading: 'Anek Bangla',
    body: 'Google Sans',
    bangla: true,
  },
  {
    name: 'Bangla rounded',
    heading: 'Baloo Da 2',
    body: 'Google Sans',
    bangla: true,
  },
  {
    name: 'Bangla festive',
    heading: 'Galada',
    body: 'Google Sans',
    bangla: true,
  },
]

/**
 * The pairing a Bangla site is offered when its fonts have no Bangla — one
 * face for headings and text, which is how the one-tap button names it.
 */
const BANGLA_PAIRING = PAIRINGS.find((pairing) => pairing.name === 'Bangla')!

/** Whether a family can draw Bangla letters itself. */
function setsBangla(name: string): boolean {
  return findFont(name)?.script === 'bangla'
}

const CORNERS: { value: string; label: string }[] = [
  { value: 'none', label: 'Square' },
  { value: 'sm', label: 'Slight' },
  { value: 'md', label: 'Soft' },
  { value: 'lg', label: 'Round' },
  { value: 'full', label: 'Pill' },
]

const WIDTHS: { value: string; label: string }[] = [
  { value: '1080px', label: 'Narrow' },
  { value: '1200px', label: 'Standard' },
  { value: '1360px', label: 'Wide' },
]

type ThemePatch = Partial<
  Pick<
    PageTheme,
    | 'primaryColor'
    | 'secondaryColor'
    | 'backgroundColor'
    | 'textColor'
    | 'headingFont'
    | 'bodyFont'
    | 'borderRadius'
    | 'containerWidth'
    | 'logoUrl'
    | 'logoWidth'
    | 'faviconUrl'
    | 'language'
    | 'numerals'
    | 'customCss'
  >
>

export function DesignPanel({
  save,
}: {
  /** Saves the working theme; bound to the store by the page. */
  save: (
    patch: Record<string, unknown>
  ) => Promise<{ ok: boolean; error?: string }>
}) {
  const theme = useBuilderStore((s) => s.theme)
  const setTheme = useBuilderStore((s) => s.setTheme)
  const pending = useRef<ThemePatch>({})
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Saves sent and not answered yet, so leaving the page can tell whether a
  // change could still be lost.
  const inFlight = useRef(0)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>(
    'idle'
  )

  /** Sends the changes still waiting, now rather than when the wait ends. */
  async function flush() {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    const batch = pending.current
    if (Object.keys(batch).length === 0) return
    pending.current = {}
    inFlight.current += 1
    setStatus('saving')
    try {
      const result = await save(batch as Record<string, unknown>)
      setStatus(result.ok ? 'saved' : 'error')
    } catch {
      setStatus('error')
    } finally {
      inFlight.current -= 1
    }
  }

  // The wait in `change` only lets a drag finish, and a new press or a move
  // of focus means it has. Every way out of this panel starts with one — the
  // rail, Exit, Publish, the page switcher — so saving then puts the save
  // ahead of whatever that click does. Server actions run one at a time in
  // the order they are called, so a Publish clicked straight after a change
  // publishes it. Closing the panel, hiding the tab and leaving the page send
  // what is left the same way: nothing waiting is ever thrown away.
  const flushNow = useEffectEvent(() => void flush())
  useEffect(() => {
    const onPress = () => flushNow()
    const onHide = () => {
      if (document.visibilityState === 'hidden') flushNow()
    }
    const onLeave = (event: BeforeUnloadEvent) => {
      if (Object.keys(pending.current).length === 0 && inFlight.current === 0)
        return
      flushNow()
      // A reload cuts off a save still on its way, so the browser asks
      // "Leave site?" first. This only happens in the second after a change.
      event.preventDefault()
    }
    document.addEventListener('pointerdown', onPress, true)
    document.addEventListener('focusin', onPress, true)
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('beforeunload', onLeave)
    return () => {
      document.removeEventListener('pointerdown', onPress, true)
      document.removeEventListener('focusin', onPress, true)
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('beforeunload', onLeave)
      flushNow()
    }
  }, [])

  if (!theme) return null

  function change(patch: ThemePatch) {
    setTheme({ ...useBuilderStore.getState().theme!, ...patch })
    pending.current = { ...pending.current, ...patch }
    if (timer.current) clearTimeout(timer.current)
    // Batched, because dragging a colour picker is fifty changes a second and
    // only the colour it stops on needs to reach the database.
    timer.current = setTimeout(() => void flush(), 500)
  }

  const activePalette = PALETTES.find(
    (palette) =>
      palette.primaryColor === theme.primaryColor &&
      palette.backgroundColor === theme.backgroundColor &&
      palette.textColor === theme.textColor
  )
  const activePairing = PAIRINGS.find(
    (pairing) =>
      pairing.heading === theme.headingFont && pairing.body === theme.bodyFont
  )
  const language = siteLanguage(theme)
  const numerals = siteNumerals(theme)
  // On a Bangla site the Bangla pairings come first: they are the ones that
  // look designed rather than patched together with a fallback face.
  const pairings =
    language === 'bn'
      ? [
          ...PAIRINGS.filter((pairing) => pairing.bangla),
          ...PAIRINGS.filter((pairing) => !pairing.bangla),
        ]
      : PAIRINGS
  const fontsLackBangla =
    language === 'bn' &&
    !(setsBangla(theme.headingFont) && setsBangla(theme.bodyFont))

  return (
    <div className="flex flex-col gap-7">
      <p className="text-muted-foreground text-xs">
        Changes apply to every page. Your live site updates when you publish.
        {status === 'saving' && ' Saving…'}
        {status === 'error' && ' Could not save — check your connection.'}
      </p>

      <section className="flex flex-col gap-3">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <Languages className="size-4" />
          Language your customers read
        </h3>
        <Segmented
          label="Shop language"
          options={(['en', 'bn'] as SiteLanguage[]).map((value) => ({
            value,
            label: SITE_LANGUAGE_LABELS[value],
          }))}
          value={language}
          onChange={(next) =>
            change(
              next === 'bn'
                ? { language: 'bn' }
                : // English digits with English words: there is no Bangla
                  // reading of "১,২৫০" next to "Add to cart".
                  { language: 'en', numerals: 'latin' }
            )
          }
        />
        <p className="text-muted-foreground text-[11px]">
          The words your shop writes itself — the cart, checkout, “Sold out” —
          and new blocks you add. Your own text stays as you wrote it.
        </p>
        {language === 'bn' && (
          <Segmented
            label="Numbers"
            options={(['latin', 'bangla'] as SiteNumerals[]).map((value) => ({
              value,
              label: value === 'bangla' ? '১,২৫০' : '1,250',
            }))}
            value={numerals}
            onChange={(next) => change({ numerals: next })}
          />
        )}
        {fontsLackBangla && (
          <div className="bg-muted flex flex-col gap-2 rounded-lg p-3 text-xs">
            <p>
              Your fonts have no Bangla letters, so Bangla text is set in a
              matching Bangla font instead. Pick fonts made for Bangla for a
              neater page.
            </p>
            <button
              type="button"
              onClick={() =>
                change({
                  headingFont: BANGLA_PAIRING.heading,
                  bodyFont: BANGLA_PAIRING.body,
                })
              }
              className="bg-card ring-border hover:ring-foreground/30 self-start rounded-md px-2.5 py-1.5 font-medium ring-1 transition"
            >
              Use {BANGLA_PAIRING.heading} for headings and text
            </button>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold">Colours</h3>
        <div className="grid grid-cols-3 gap-2">
          {PALETTES.map((palette) => {
            const active = activePalette?.name === palette.name
            return (
              <button
                key={palette.name}
                type="button"
                onClick={() =>
                  change({
                    primaryColor: palette.primaryColor,
                    secondaryColor: palette.secondaryColor,
                    backgroundColor: palette.backgroundColor,
                    textColor: palette.textColor,
                  })
                }
                className={cn(
                  'flex flex-col gap-1.5 rounded-lg p-1.5 text-left ring-1 transition',
                  active
                    ? 'ring-foreground ring-2'
                    : 'ring-border hover:ring-foreground/30'
                )}
                aria-pressed={active}
              >
                <span
                  className="relative flex h-9 overflow-hidden rounded-md ring-1 ring-black/5"
                  style={{ backgroundColor: palette.backgroundColor }}
                >
                  <span className="m-1.5 flex flex-1 items-end gap-1">
                    <span
                      className="h-2 w-5 rounded-sm"
                      style={{ backgroundColor: palette.textColor }}
                    />
                    <span
                      className="h-3.5 w-3.5 rounded-sm"
                      style={{ backgroundColor: palette.primaryColor }}
                    />
                    <span
                      className="h-2.5 w-2.5 rounded-sm"
                      style={{ backgroundColor: palette.secondaryColor }}
                    />
                  </span>
                  {active && (
                    <Check
                      className="absolute top-1 right-1 size-3.5"
                      style={{ color: palette.textColor }}
                    />
                  )}
                </span>
                <span className="px-0.5 text-[11px] font-medium">
                  {palette.name}
                </span>
              </button>
            )
          })}
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-3 pt-1">
          <ThemeColor
            label="Brand"
            hint="Buttons and highlights"
            value={theme.primaryColor}
            onChange={(primaryColor) => change({ primaryColor })}
          />
          <ThemeColor
            label="Accent"
            hint="Second colour"
            value={theme.secondaryColor}
            onChange={(secondaryColor) => change({ secondaryColor })}
          />
          <ThemeColor
            label="Background"
            value={theme.backgroundColor}
            onChange={(backgroundColor) => change({ backgroundColor })}
          />
          <ThemeColor
            label="Text"
            value={theme.textColor}
            onChange={(textColor) => change({ textColor })}
          />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold">Fonts</h3>
        <div className="grid grid-cols-2 gap-2">
          {pairings.map((pairing) => {
            const active = activePairing?.name === pairing.name
            return (
              <button
                key={pairing.name}
                type="button"
                onClick={() =>
                  change({
                    headingFont: pairing.heading,
                    bodyFont: pairing.body,
                  })
                }
                aria-pressed={active}
                className={cn(
                  'flex flex-col gap-0.5 rounded-lg px-3 py-2 text-left ring-1 transition',
                  active
                    ? 'ring-foreground ring-2'
                    : 'ring-border hover:ring-foreground/30'
                )}
              >
                <span
                  className="text-lg leading-tight font-semibold"
                  style={{ fontFamily: fontStack(pairing.heading) }}
                >
                  {pairing.bangla ? 'অআ Aa' : 'Aa Bb'}
                </span>
                <span
                  className="text-muted-foreground text-[11px]"
                  style={{ fontFamily: fontStack(pairing.body) }}
                >
                  {pairing.name} · {pairing.heading}
                </span>
              </button>
            )
          })}
        </div>
        <Field>
          <FieldLabel>Headings</FieldLabel>
          <FontPicker
            value={theme.headingFont}
            onValueChange={(headingFont) => change({ headingFont })}
          />
        </Field>
        <Field>
          <FieldLabel>Text</FieldLabel>
          <FontPicker
            value={theme.bodyFont}
            onValueChange={(bodyFont) => change({ bodyFont })}
          />
        </Field>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold">Shape</h3>
        <Segmented
          label="Corners"
          options={CORNERS}
          value={theme.borderRadius}
          onChange={(borderRadius) => change({ borderRadius })}
        />
        <Segmented
          label="Page width"
          options={WIDTHS}
          value={theme.containerWidth}
          onChange={(containerWidth) => change({ containerWidth })}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold">Logo</h3>
        <Field>
          <FieldLabel>Logo</FieldLabel>
          <ImagePicker
            value={theme.logoUrl ?? ''}
            onChange={(logoUrl) => change({ logoUrl: logoUrl || null })}
          />
          <FieldDescription>
            Shown in your header in place of your shop’s name.
          </FieldDescription>
        </Field>
        {theme.logoUrl && (
          <Field>
            <FieldLabel>Logo size · {theme.logoWidth ?? 140}px</FieldLabel>
            <input
              type="range"
              min={60}
              max={320}
              step={10}
              value={theme.logoWidth ?? 140}
              onChange={(event) =>
                change({ logoWidth: Number(event.target.value) })
              }
              className="accent-foreground w-full"
            />
          </Field>
        )}
        <Field>
          <FieldLabel>Browser tab icon</FieldLabel>
          <ImagePicker
            value={theme.faviconUrl ?? ''}
            onChange={(faviconUrl) =>
              change({ faviconUrl: faviconUrl || null })
            }
            aspect={1}
          />
          <FieldDescription>
            A small square picture shown in the browser tab.
          </FieldDescription>
        </Field>
      </section>

      {/* The designer's way past the controls above, on every page of the
          site. A block takes a class name under Block → Advanced, and is
          styled from here; the canvas shows the result as it is typed. */}
      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold">Custom CSS</h3>
        <Field>
          <Textarea
            value={theme.customCss ?? ''}
            onChange={(event) => change({ customCss: event.target.value })}
            rows={6}
            maxLength={20_000}
            spellCheck={false}
            placeholder={
              '.big-offer {\n  border: 2px solid var(--page-primary);\n}'
            }
            aria-label="Custom CSS for every page"
            className="font-mono text-xs"
          />
          <FieldDescription>
            For designers: styles for every page of this site. Give a block a
            class name under its Block tab, then style it here. Use
            var(--page-primary) and the other theme colours to stay in step with
            the palette.
          </FieldDescription>
        </Field>
      </section>
    </div>
  )
}

function ThemeColor({
  label,
  hint,
  value,
  onChange,
}: {
  label: string
  hint?: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <Field className="gap-1.5">
      <FieldLabel className="text-xs">{label}</FieldLabel>
      <ColorField
        value={value}
        allowClear={false}
        onChange={(next) =>
          next && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(next) && onChange(next)
        }
      />
      {hint && (
        <FieldDescription className="text-[11px]">{hint}</FieldDescription>
      )}
    </Field>
  )
}

function Segmented({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: { value: string; label: string }[]
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium">{label}</span>
      <div className="bg-muted flex rounded-lg p-0.5">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={value === option.value}
            className={cn(
              'flex-1 rounded-md px-1.5 py-1.5 text-[11px] font-medium transition',
              value === option.value
                ? 'bg-card shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}
