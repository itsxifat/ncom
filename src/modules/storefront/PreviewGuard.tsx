'use client'

import { useEffect } from 'react'

/**
 * Keeps a preview a picture.
 *
 * A template preview is a real page drawn with made-up products, and every
 * link on it points at a shop that does not exist yet. Following one would
 * land the merchant on a 404 inside the gallery, so clicks on links and form
 * submissions are stopped here — everything else (scrolling, hovering, the
 * slider) still works, which is what a merchant previewing a design wants.
 */
export function PreviewGuard() {
  useEffect(() => {
    const stopLinks = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest('a')) {
        event.preventDefault()
      }
    }
    const stopForms = (event: Event) => event.preventDefault()
    document.addEventListener('click', stopLinks, true)
    document.addEventListener('submit', stopForms, true)
    return () => {
      document.removeEventListener('click', stopLinks, true)
      document.removeEventListener('submit', stopForms, true)
    }
  }, [])
  return null
}
