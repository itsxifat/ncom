'use client'

import { useEffect, useRef } from 'react'
import { useCart, type CartApi } from '@/modules/storefront/CartProvider'
import { markEditable } from './editable'

/**
 * The stylesheet every custom design starts from, inside its shadow root.
 *
 * A shadow root is a clean slate: none of the storefront's CSS reaches into
 * it, which is the point, but that also means none of the page theme's rules
 * do. Inherited values — the colour, the body font, every `--page-*` token —
 * still flow in through the host, so all this adds is box sizing and pictures
 * that fit their column. Headings are left to inherit rather than set in the
 * theme's heading face: a pasted design that sets its own font on `body`
 * expects its headings in it too, and one that wants the theme's writes
 * `var(--page-font-heading)`. Everything is inside `:where()`, so any rule in
 * the pasted CSS wins — except `hidden`, which a hook sets to take a figure
 * away (a "was ৳1,200" with no discount behind it) and which a design's own
 * `display: flex` must not bring back.
 */
const BASE_CSS = [
  ':host{display:block}',
  ':where(*,*::before,*::after){box-sizing:border-box}',
  ':where(img,video){max-width:100%;height:auto}',
  '[hidden]{display:none!important}',
  ':where([data-ncom-act]){cursor:pointer}',
  ':where([data-ncom-act][aria-busy="true"]){opacity:.6;cursor:progress}',
  ':where([data-ncom-act][aria-disabled="true"]){opacity:.5;cursor:not-allowed}',
].join('')

/**
 * What the canvas adds, so a merchant can see what in a design they can
 * change by clicking and what is connected to their shop. Marked important:
 * a design that turns outlines off for its own reasons must not hide these.
 */
const EDITING_CSS = [
  '[data-ncom-editable]{cursor:text}',
  '[data-ncom-editable]:hover{outline:1.5px dashed rgb(37 99 235/.6)!important;outline-offset:3px!important}',
  '[data-ncom-editable][contenteditable="true"]{outline:2px solid rgb(37 99 235)!important;outline-offset:3px!important}',
  '[data-ncom-editable-image]{cursor:pointer}',
  '[data-ncom-editable-image]:hover{outline:2px dashed rgb(37 99 235/.6)!important;outline-offset:3px!important}',
  ':is([data-ncom-price],[data-ncom-regular-price],[data-ncom-saving],[data-ncom-name],[data-ncom-delivery]):hover{outline:1.5px dotted rgb(22 163 74)!important;outline-offset:3px!important}',
  '[data-ncom-missing]{outline:2px dashed rgb(245 158 11)!important;outline-offset:3px!important}',
].join('')

/**
 * Draws a sanitised custom design inside its own shadow root.
 *
 * Two paths reach the same DOM. On a page rendered by the server — the live
 * site, a preview — the markup arrives as a declarative shadow root
 * (`<template shadowrootmode="open">`) that the browser's parser attaches
 * before any script runs, so the design is there with JavaScript off and is
 * indexable like any other markup. A render that happens in the browser — the
 * builder canvas, as the merchant edits — cannot use that, because markup set
 * through `innerHTML` never attaches a shadow root; the effect below attaches
 * one itself and keeps it in step with every edit.
 *
 * `markup` has already been through `sanitizeCustomCode` and `bindHooks`.
 * This component adds nothing to it but the sheets above, and carries out the
 * clicks the hooks asked for: an order button picks its offer and scrolls to
 * the order form, an add-to-cart puts the product in the cart. Outside a live
 * store — the canvas, a preview — the cart is absent and those clicks do
 * nothing, as the store's own buttons do there.
 */
export function CustomCodeFrame({
  markup,
  editing,
}: {
  markup: string
  editing?: boolean
}) {
  const host = useRef<HTMLDivElement>(null)
  const applied = useRef<string | null>(null)
  const cart = useCart()
  // Read from the click handler, which is bound once per design: the cart
  // object changes with every line added, and rebinding for that would be
  // churn for nothing.
  const cartRef = useRef<CartApi | null>(cart)
  useEffect(() => {
    cartRef.current = cart
  }, [cart])
  const content = `<style>${BASE_CSS}${editing ? EDITING_CSS : ''}</style>${markup}`

  useEffect(() => {
    const node = host.current
    if (!node) return
    let root = node.shadowRoot
    if (!root) {
      root = node.attachShadow({ mode: 'open' })
    } else if (applied.current === null) {
      // Attached by the parser from this same render's server HTML.
      applied.current = content
      if (editing) markEditable(root)
      return
    }
    if (applied.current !== content) {
      root.innerHTML = content
      applied.current = content
      if (editing) markEditable(root)
    }
  }, [content, editing])

  useEffect(() => {
    const root = host.current?.shadowRoot
    if (!root) return

    function onClick(event: Event) {
      if (event.defaultPrevented || !(event.target instanceof Element)) return

      const actor = event.target.closest('[data-ncom-act]')
      if (actor) {
        event.preventDefault()
        void act(actor, cartRef.current)
        return
      }

      // A `#section` link inside the design jumps to a section of the page by
      // itself — the browser looks fragment ids up in the document. What it
      // cannot find is an id inside this shadow root, so those are scrolled to
      // here. On the canvas the editor has already cancelled the click.
      const anchor = event.target.closest('a[href^="#"]')
      const id = anchor?.getAttribute('href')?.slice(1)
      if (!id) return
      let target: Element | null = null
      try {
        target = root!.getElementById(decodeURIComponent(id))
      } catch {
        return
      }
      if (!target) return
      event.preventDefault()
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }

    // A hooked element that is not a link or a button was given a button's
    // role and a place in the tab order; this gives it a button's keys.
    function onKeyDown(event: Event) {
      if (!(event instanceof KeyboardEvent) || event.defaultPrevented) return
      if (event.key !== 'Enter' && event.key !== ' ') return
      const actor =
        event.target instanceof Element
          ? event.target.closest('[data-ncom-act][role="button"]')
          : null
      if (!actor || actor !== event.target) return
      event.preventDefault()
      void act(actor, cartRef.current)
    }

    root.addEventListener('click', onClick)
    root.addEventListener('keydown', onKeyDown)
    return () => {
      root.removeEventListener('click', onClick)
      root.removeEventListener('keydown', onKeyDown)
    }
  }, [content])

  return (
    <div
      ref={host}
      // How the canvas tells a click inside a design from one on the page.
      data-ncom-code=""
      // On the canvas, a design with `position: fixed` (a floating chat
      // button, a sticky bar) is kept inside its block instead of covering
      // the editor; on the live site it is as fixed as its author wrote it.
      style={editing ? { contain: 'layout' } : undefined}
      // The template is consumed by the parser on the way in, so the light
      // DOM React hydrates against is empty by design.
      suppressHydrationWarning
      dangerouslySetInnerHTML={{
        __html: `<template shadowrootmode="open">${content}</template>`,
      }}
    />
  )
}

/**
 * Does what a hooked element was bound to do (see `bindHooks`, which wrote
 * every attribute read here from what the page sells).
 */
async function act(actor: Element, cart: CartApi | null) {
  if (
    actor.getAttribute('aria-disabled') === 'true' ||
    actor.getAttribute('aria-busy') === 'true'
  ) {
    return
  }
  const action = actor.getAttribute('data-ncom-act')

  if (action === 'order') {
    // The order form listens for this and switches to the offer, so "Order
    // the combo" lands on a form already set to the combo.
    const offerKey = actor.getAttribute('data-ncom-offer')
    if (offerKey) {
      window.dispatchEvent(
        new CustomEvent('ncom:choose-offer', { detail: { offerKey } })
      )
    }
    document
      .getElementById('order')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    return
  }

  if (action !== 'add' && action !== 'buy') return
  const variantId = actor.getAttribute('data-ncom-variant')
  const productHref = actor.getAttribute('data-ncom-href')
  // A product with sizes or colours is chosen on its own page; guessing the
  // size for the shopper is how a store ships the wrong one.
  if (!variantId) {
    if (productHref) window.location.assign(productHref)
    return
  }
  if (!cart) return
  actor.setAttribute('aria-busy', 'true')
  const added = await cart.add({
    variantId,
    productId: actor.getAttribute('data-ncom-product-id') ?? undefined,
    quantity: 1,
  })
  actor.removeAttribute('aria-busy')
  if (added && action === 'buy') window.location.assign(cart.paths.checkout)
}
