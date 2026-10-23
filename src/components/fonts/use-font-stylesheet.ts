'use client'

import { useEffect, useState, type RefObject } from 'react'

/** Sheets that arrived with faces in them. These stay for the life of the tab. */
const loaded = new Set<string>()
/** Sheets on their way. */
const loading = new Set<string>()
/** Sheets that failed, waiting to be asked for again. */
const retries = new Map<string, ReturnType<typeof setTimeout>>()
/** How many times each sheet has failed in a row, to space the retries out. */
const failures = new Map<string, number>()
/** How many mounted components want each sheet, so a retry asks only for sheets still on screen. */
const wanted = new Map<string, number>()

/**
 * The wait before asking again for a sheet that failed, doubling after each
 * failure in a row up to eight times this. Just past the two minutes the proxy
 * remembers that Google failed it for a family (and so past the minute it
 * tells the browser to keep the empty answer): any sooner, and the retry would
 * only be handed the same remembered failure.
 */
const RETRY_AFTER_MS = 130_000

/**
 * Adds a font stylesheet from NCOM's font proxy to the document, once per
 * address for the life of the tab.
 *
 * Inserted by hand rather than rendered as a React `<link precedence>`. React
 * holds a commit back until such a stylesheet has loaded, so in the picker a
 * keystroke that brought a new family into view would wait on a round trip to
 * Google before the letter even appeared in the search box. A sheet that loads
 * is never taken out again: each is a few hundred bytes, and a face that has
 * been shown once should not flash back to the fallback when the list
 * re-renders.
 *
 * A sheet that fails is not remembered as done. The proxy answers a family
 * Google was too slow for with an empty stylesheet, and a rate-limited request
 * with an error, both meaning "ask again soon". A builder tab stays open for
 * hours, so such a sheet is asked for again a little later while something on
 * screen still wants it, and the next time something does otherwise.
 */
export function useFontStylesheet(href: string | null) {
  useEffect(() => {
    if (!href) return
    wanted.set(href, (wanted.get(href) ?? 0) + 1)
    request(href)
    return () => {
      const left = (wanted.get(href) ?? 1) - 1
      if (left > 0) wanted.set(href, left)
      else wanted.delete(href)
    }
  }, [href])
}

function request(href: string) {
  if (loaded.has(href) || loading.has(href) || retries.has(href)) return
  loading.add(href)

  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = href
  const settle = (ok: boolean) => {
    loading.delete(href)
    if (ok) {
      loaded.add(href)
      failures.delete(href)
      return
    }
    // Out of the document, so the retry is a fresh request rather than a
    // second link to the same empty sheet.
    link.remove()
    const failed = (failures.get(href) ?? 0) + 1
    failures.set(href, failed)
    retries.set(
      href,
      setTimeout(
        () => {
          retries.delete(href)
          if (wanted.has(href)) request(href)
        },
        RETRY_AFTER_MS * 2 ** Math.min(failed - 1, 3)
      )
    )
  }
  link.addEventListener('load', () => settle(hasFaces(link)), { once: true })
  link.addEventListener('error', () => settle(false), { once: true })
  document.head.append(link)
}

/**
 * Whether a sheet that loaded has anything in it. The proxy's way of saying it
 * could not get a family just now is a successful but empty stylesheet, which
 * the browser reports as loaded like any other.
 */
function hasFaces(link: HTMLLinkElement): boolean {
  try {
    return (link.sheet?.cssRules.length ?? 0) > 0
  } catch {
    // Only a sheet from another origin hides its rules, and these are all
    // NCOM's own; if one ever does, it loaded, so take it as done.
    return true
  }
}

/**
 * True once the element has stayed on screen for a moment, and from then on.
 *
 * The moment matters. Typing "s" brings a screenful of families into view and
 * the next letter replaces most of them; without the wait, every one of those
 * would fetch a font nobody had time to look at. Clipping by the list's own
 * scroll box counts, so rows scrolled out of the popup are not "on screen".
 */
export function useSeen(ref: RefObject<Element | null>, dwellMs = 150) {
  const [seen, setSeen] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (seen || !node) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const observer = new IntersectionObserver(([entry]) => {
      clearTimeout(timer)
      if (entry?.isIntersecting)
        timer = setTimeout(() => setSeen(true), dwellMs)
    })
    observer.observe(node)
    return () => {
      observer.disconnect()
      clearTimeout(timer)
    }
  }, [ref, seen, dwellMs])

  return seen
}
