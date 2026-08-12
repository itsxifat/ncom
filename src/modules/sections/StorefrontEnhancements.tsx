'use client'

import { useEffect } from 'react'

/**
 * Activates the sections that need behaviour rather than markup.
 *
 * Liquid sections are inserted with `dangerouslySetInnerHTML`, and React does
 * not execute `<script>` tags inserted that way — so a countdown that shipped
 * its own inline script would render the numbers once and never tick. Rather
 * than give each section a script that cannot run, behaviour lives here and
 * sections declare what they want with data attributes.
 *
 * Rendered once per page by PageRenderer. It attaches to whatever is present
 * and does nothing at all on a page with no such sections, so the cost to a
 * page that uses neither is one effect that finds no elements.
 *
 * Contract:
 *   [data-countdown-to="<ISO>"]      — counts down to a fixed moment
 *   [data-countdown-hours="<n>"]     — evergreen: n hours from first visit
 *   [data-countdown-expired]         — text shown once it reaches zero
 *   [data-sticky-after="<px>"]       — revealed after scrolling that far
 *   [data-offer-key="<key>"]         — selects that offer in the order form
 */
export const SELECT_OFFER_EVENT = 'ncom:select-offer'

export function StorefrontEnhancements() {
  useEffect(() => {
    const countdowns = Array.from(
      document.querySelectorAll<HTMLElement>(
        '[data-countdown-to],[data-countdown-hours]'
      )
    )
    const stickies = Array.from(
      document.querySelectorAll<HTMLElement>('[data-sticky-after]')
    )

    // ── Countdowns ────────────────────────────────────────────────────
    const deadlines = new Map<HTMLElement, number>()

    for (const element of countdowns) {
      const fixed = element.dataset.countdownTo
      if (fixed) {
        const parsed = Date.parse(fixed)
        if (!Number.isNaN(parsed)) deadlines.set(element, parsed)
        continue
      }

      const hours = Number(element.dataset.countdownHours)
      if (!Number.isFinite(hours) || hours <= 0) continue

      // Evergreen timers persist per visitor so a refresh does not reset the
      // urgency — a timer that restarts on every page load is transparently
      // fake and buyers notice.
      const key = `ncom-countdown:${element.dataset.countdownId ?? 'default'}`
      let start = Number(window.localStorage.getItem(key))
      if (!Number.isFinite(start) || start <= 0) {
        start = Date.now()
        try {
          window.localStorage.setItem(key, String(start))
        } catch {
          // Private mode: fall back to a per-load timer rather than failing.
        }
      }
      deadlines.set(element, start + hours * 3600_000)
    }

    function pad(value: number): string {
      return value < 10 ? `0${value}` : String(value)
    }

    function tick() {
      const now = Date.now()

      for (const [element, deadline] of deadlines) {
        const remaining = deadline - now

        if (remaining <= 0) {
          const expired = element.dataset.countdownExpired
          if (expired && element.dataset.countdownDone !== '1') {
            element.dataset.countdownDone = '1'
            element.textContent = expired
          }
          continue
        }

        const totalSeconds = Math.floor(remaining / 1000)
        const values: Record<string, string> = {
          days: pad(Math.floor(totalSeconds / 86400)),
          hours: pad(Math.floor((totalSeconds % 86400) / 3600)),
          minutes: pad(Math.floor((totalSeconds % 3600) / 60)),
          seconds: pad(totalSeconds % 60),
        }

        for (const [unit, value] of Object.entries(values)) {
          const slot = element.querySelector(`[data-countdown-unit="${unit}"]`)
          if (slot && slot.textContent !== value) slot.textContent = value
        }
      }
    }

    tick()
    const timer =
      deadlines.size > 0 ? window.setInterval(tick, 1000) : undefined

    // ── Sticky bars ───────────────────────────────────────────────────
    function onScroll() {
      for (const element of stickies) {
        const after = Number(element.dataset.stickyAfter) || 0
        element.classList.toggle('is-visible', window.scrollY > after)
      }
    }

    if (stickies.length > 0) {
      onScroll()
      window.addEventListener('scroll', onScroll, { passive: true })
    }

    // ── Offer cards ───────────────────────────────────────────────────
    // A bundle card is Liquid-rendered HTML and the order form is a React
    // component; they cannot share state directly, so the click is relayed as
    // a window event the form listens for. Delegated from the document so it
    // keeps working when the builder canvas swaps the markup underneath.
    function onOfferClick(event: MouseEvent) {
      const target = event.target as HTMLElement | null
      const trigger = target?.closest<HTMLElement>('[data-offer-key]')
      const key = trigger?.dataset.offerKey
      if (!key) return

      event.preventDefault()
      window.dispatchEvent(
        new CustomEvent(SELECT_OFFER_EVENT, { detail: { key } })
      )
      document
        .getElementById('order')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }

    document.addEventListener('click', onOfferClick)

    return () => {
      if (timer) window.clearInterval(timer)
      if (stickies.length > 0) window.removeEventListener('scroll', onScroll)
      document.removeEventListener('click', onOfferClick)
    }
  }, [])

  return null
}
