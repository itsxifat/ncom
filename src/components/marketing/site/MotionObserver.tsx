'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

/**
 * Animations that should play when their element scrolls into view, rather
 * than as soon as the page loads. Matched by keyframe name in the inline style,
 * so a section only has to use one of these keyframes to get the behaviour.
 */
export const IN_VIEW_SELECTOR = [
  'ncom-rise',
  'ncom-grow',
  'ncom-ring',
  'ncom-underline',
  'hx-in',
]
  .map((name) => `.ncom-site [style*="${name}"]`)
  .join(',')

/**
 * Plays each section's entrance once, as it comes into view — in every
 * browser, and never stuck half-way.
 *
 * The design first scrubbed these with `animation-timeline: view()`: Chrome
 * only, and a visitor who stopped scrolling mid-range was left reading text at
 * half opacity. Now the CSS holds them paused (only once this has run, so a
 * page without JavaScript shows everything), and this sets them off — a few
 * at a time, slightly staggered.
 */
export function MotionObserver() {
  const pathname = usePathname()

  useEffect(() => {
    const root = document.documentElement
    root.classList.add('ncom-motion')

    const elements = Array.from(
      document.querySelectorAll<HTMLElement>(IN_VIEW_SELECTOR)
    )
    if (!('IntersectionObserver' in window)) {
      elements.forEach((element) => element.classList.add('is-in'))
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        let order = 0
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          const element = entry.target as HTMLElement
          element.style.animationDelay = `${Math.min(order, 6) * 70}ms`
          element.classList.add('is-in')
          observer.unobserve(element)
          order += 1
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }
    )
    elements.forEach((element) => {
      if (!element.classList.contains('is-in')) observer.observe(element)
    })
    return () => observer.disconnect()
  }, [pathname])

  return null
}
