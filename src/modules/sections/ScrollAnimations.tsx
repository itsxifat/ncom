'use client'

import { useEffect } from 'react'

/**
 * Fires the entrance animations a merchant configured.
 *
 * Mounted only when a page actually has one, and never inside the builder
 * canvas — an editor where blocks fade out as you scroll past them is an editor
 * you cannot work in.
 *
 * The no-JS contract lives here as much as in the stylesheet: `ncom-anim` is
 * what makes the start state (`opacity: 0`) apply at all, and it is added from
 * this effect. If the script never runs, never loads, or throws, the class is
 * absent, the start state never matches, and every animated element renders
 * plainly. An animation is decoration — it must never be load-bearing for
 * whether a shopper can read the page.
 */
export function ScrollAnimations() {
  useEffect(() => {
    const root = document.documentElement

    // Elements are found by asking the cascade, not by an attribute in the
    // markup: the stylesheet is the only thing that knows which elements were
    // given an animation, and reading the custom property back means the two
    // can never disagree.
    const targets = Array.from(
      document.querySelectorAll<HTMLElement>('[data-el]')
    ).filter(
      (node) =>
        getComputedStyle(node).getPropertyValue('--ncom-anim-name').trim() !==
        ''
    )
    if (!targets.length) return

    root.classList.add('ncom-anim')

    // Anything already on screen is marked in the same task that added the
    // class above, so the browser paints once — with the element hidden and its
    // animation already running — instead of painting it, hiding it, and
    // flashing on the way back in.
    const pending = new Set<HTMLElement>()
    for (const node of targets) {
      const box = node.getBoundingClientRect()
      if (box.top < window.innerHeight && box.bottom > 0) {
        node.classList.add('ncom-in')
      } else {
        pending.add(node)
      }
    }

    if (!pending.size) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          entry.target.classList.add('ncom-in')
          // Unobserved once it has played. These are entrance animations: a
          // heading that re-animates every time it scrolls back into view reads
          // as a glitch, not as motion design.
          observer.unobserve(entry.target)
        }
      },
      // A little margin so an element starts moving as it arrives rather than
      // after it is already fully on screen.
      { rootMargin: '0px 0px -10% 0px', threshold: 0.01 }
    )

    for (const node of pending) observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return null
}
