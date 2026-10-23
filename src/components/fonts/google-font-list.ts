'use client'

import { useEffect, useSyncExternalStore } from 'react'

import { findFont } from '@/lib/fonts'
import { fontStylesheetHrefs, googleFamilyName } from '@/lib/font-stylesheet'
import type { GoogleFont } from '@/lib/google-fonts'

/** What `/api/fonts/list` sends for each family: enough to search and label it. */
export type GoogleFontSummary = Pick<
  GoogleFont,
  'family' | 'category' | 'bangla' | 'popularity'
>

export interface GoogleFontList {
  status: 'idle' | 'loading' | 'ready' | 'error'
  /**
   * Most used first, without the families the self-hosted catalogue already
   * has: the picker lists those in their own groups, and a second "Poppins"
   * further down would only make a merchant wonder which one is real.
   */
  fonts: readonly GoogleFontSummary[]
}

/**
 * The line a Bangla-capable family is previewed in, and the line the picker
 * falls back to for Bangla copy when the section has no text of its own.
 */
export const BANGLA_SPECIMEN = 'আপনার দোকানের জন্য বাছাই করা — ১,২৯০'

export const GOOGLE_CATEGORY_LABEL: Record<GoogleFont['category'], string> = {
  sans: 'Sans serif',
  serif: 'Serif',
  display: 'Display',
  handwriting: 'Handwriting',
  mono: 'Monospace',
}

/**
 * The stylesheet that sets one family's name and Bangla sample, and nothing
 * else.
 *
 * Google cuts a font file down to just the letters in `text`, so a preview row
 * costs a few kilobytes instead of a whole family. Every place the picker
 * shows a Google family (its row, the closed control) asks with this same
 * text, so they share one request and one `@font-face` rather than two subsets
 * of the same face competing for the same letters. Latin-only families get
 * the Bangla letters asked for too; Google simply has none to send.
 *
 * Asked for in Google's spelling, which is also how the picker shows the
 * name: a theme that saved "lexend" gets the capital L it is displayed with.
 * Null for a name that is not on Google Fonts, which has nothing to fetch.
 */
export function specimenStylesheetHref(name: string): string | null {
  const family = googleFamilyName(name)
  if (!family) return null
  return fontStylesheetHrefs([family], `${family}${BANGLA_SPECIMEN}`)[0] ?? null
}

// One list for the whole tab. The builder shows two pickers side by side and
// a merchant opens them over and over; each fetching its own copy would be the
// same 100 KB again every time.
const IDLE: GoogleFontList = { status: 'idle', fonts: [] }
let current: GoogleFontList = IDLE
const listeners = new Set<() => void>()

function publish(next: GoogleFontList) {
  current = next
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Fetches the list once; after a failure, calling it again tries again. */
export function loadGoogleFonts() {
  if (current.status === 'loading' || current.status === 'ready') return
  publish({ status: 'loading', fonts: [] })
  fetch('/api/fonts/list')
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return response.json() as Promise<{ families: GoogleFontSummary[] }>
    })
    .then(({ families }) =>
      publish({
        status: 'ready',
        fonts: families.filter((font) => !findFont(font.family)),
      })
    )
    .catch(() => publish({ status: 'error', fonts: [] }))
}

/**
 * The full Google Fonts list, fetched the first time `wanted` is true.
 *
 * Lazy because most merchants pick from the catalogue and never need it:
 * nothing is downloaded until someone searches or asks to browse.
 */
export function useGoogleFonts(wanted: boolean): GoogleFontList {
  const list = useSyncExternalStore(
    subscribe,
    () => current,
    () => IDLE
  )
  useEffect(() => {
    if (wanted) loadGoogleFonts()
  }, [wanted])
  return list
}

/**
 * Lower-cased with the spaces taken out, so "hindsiliguri", "Hind Siliguri"
 * and "hind  siliguri" all find the same family.
 */
function squash(text: string) {
  return text.toLowerCase().replace(/\s+/g, '')
}

/** Whether a family name matches what was typed into the search box. */
export function matchesFontQuery(name: string, query: string): boolean {
  return squash(name).includes(squash(query))
}

/**
 * The Google families matching a search, best first.
 *
 * Popularity is the main order, since among 1,800 families the ones other
 * shops use are the safest bets. Two things outrank it. A family whose name
 * starts with what was typed beats one that merely contains it ("ro" should
 * find Roboto before Aboreto). And when the merchant is writing Bangla, the
 * families that can set it come first, as they do in the catalogue above.
 */
export function searchGoogleFonts(
  fonts: readonly GoogleFontSummary[],
  query: string,
  options: {
    banglaOnly: boolean
    banglaFirst: boolean
    /** A family already listed elsewhere in the picker. */
    exclude?: string | null
  }
): GoogleFontSummary[] {
  const typed = query.trim().toLowerCase()
  const excluded = options.exclude?.trim().replace(/\s+/g, ' ').toLowerCase()
  const startsAWord = (family: string) =>
    ` ${family.toLowerCase()}`.includes(` ${typed}`)

  return fonts
    .filter(
      (font) =>
        (!options.banglaOnly || font.bangla) &&
        font.family.toLowerCase() !== excluded &&
        matchesFontQuery(font.family, typed)
    )
    .map((font) => ({
      font,
      rank:
        (options.banglaFirst && !font.bangla ? 2 : 0) +
        (typed && !startsAWord(font.family) ? 1 : 0),
    }))
    .sort((a, b) => a.rank - b.rank)
    .map(({ font }) => font)
}
