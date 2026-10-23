'use client'

import { useEffect, useState } from 'react'
import { Menu, Search, ShoppingBag, UserRound, X } from 'lucide-react'
import { El } from '../elements'
import { storePaths } from '../storefront'
import { useCart } from '@/modules/storefront/CartProvider'
import { useStoreText } from '@/modules/storefront/StoreTextProvider'
import { cn } from '@/lib/utils'
import type { HeaderLink } from './index'

const ICON_BUTTON =
  'relative flex size-10 items-center justify-center rounded-full transition hover:bg-[color-mix(in_oklab,var(--page-text)_8%,transparent)]'

/**
 * The header's search, account and cart icons.
 *
 * The cart icon opens the drawer when the page has a live cart and is a plain
 * link to the cart page otherwise — which is what it is in the builder, where
 * nothing should open, and on a browser that never ran this script.
 */
export function HeaderActions({
  linkBase,
  showSearch,
  showAccount,
  showCart,
  searchPlaceholder,
  editing,
}: {
  linkBase: string
  showSearch: boolean
  showAccount: boolean
  showCart: boolean
  searchPlaceholder: string
  editing?: boolean
}) {
  const cart = useCart()
  const { words, number } = useStoreText()
  const paths = storePaths(linkBase)
  const [searching, setSearching] = useState(false)
  const count = cart?.count ?? 0

  return (
    <El as="div" part="icons" className="flex items-center justify-end gap-1">
      {showSearch && (
        <El
          as="button"
          part="icon"
          index={0}
          type="button"
          aria-label={words.search}
          aria-expanded={searching}
          onClick={() => setSearching((open) => !open)}
          className={ICON_BUTTON}
        >
          <Search className="size-5" />
        </El>
      )}
      {showAccount && (
        <El
          as="a"
          part="icon"
          index={1}
          href={paths.account}
          aria-label={words.yourAccount}
          className={cn(ICON_BUTTON, 'hidden sm:flex')}
        >
          <UserRound className="size-5" />
        </El>
      )}
      {showCart && (
        <El
          as="a"
          part="icon"
          index={2}
          href={paths.cart}
          aria-label={words.cartIcon(count)}
          onClick={(event: React.MouseEvent) => {
            if (!cart) return
            event.preventDefault()
            cart.openCart()
          }}
          className={ICON_BUTTON}
        >
          <ShoppingBag className="size-5" />
          {(count > 0 || editing) && (
            <El
              as="span"
              part="cartCount"
              className="absolute top-1 right-0.5 flex min-w-[1.15rem] items-center justify-center rounded-full bg-[var(--page-primary)] px-1 text-[10px] leading-[1.15rem] font-bold text-[var(--page-on-primary)]"
            >
              {number(editing && count === 0 ? 2 : count)}
            </El>
          )}
        </El>
      )}

      {showSearch && searching && (
        <El
          as="form"
          part="searchBar"
          role="search"
          action={paths.search()}
          method="get"
          className="absolute inset-x-0 top-full z-10 border-b border-[color-mix(in_oklab,var(--page-text)_10%,transparent)] bg-[var(--page-background)] px-4 py-4 shadow-lg sm:px-6"
        >
          <div className="mx-auto flex max-w-2xl items-center gap-3">
            <Search className="size-5 shrink-0 opacity-50" />
            <input
              name="q"
              type="search"
              autoFocus
              placeholder={searchPlaceholder}
              className="h-11 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:opacity-50"
            />
            <button
              type="button"
              aria-label={words.closeSearch}
              onClick={() => setSearching(false)}
              className={ICON_BUTTON}
            >
              <X className="size-5" />
            </button>
          </div>
        </El>
      )}
    </El>
  )
}

/** The menu icon on phones, and the panel of links it opens. */
export function MobileMenuButton({
  links,
  storeName,
  linkBase,
  showAccount,
  editing,
}: {
  links: HeaderLink[]
  storeName: string
  linkBase: string
  showAccount: boolean
  editing?: boolean
}) {
  const [open, setOpen] = useState(false)
  const { words } = useStoreText()
  const paths = storePaths(linkBase)

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      <El
        as="button"
        part="icon"
        index={3}
        type="button"
        aria-label={words.openMenu}
        aria-expanded={open}
        onClick={() => !editing && setOpen(true)}
        className={cn(ICON_BUTTON, '-ml-2 lg:hidden')}
      >
        <Menu className="size-5" />
      </El>

      {open && (
        <div className="fixed inset-0 z-[55] lg:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <El
            as="nav"
            part="mobileMenu"
            aria-label={words.menu}
            className="absolute inset-y-0 left-0 flex w-[min(20rem,85vw)] flex-col bg-[var(--page-background)] text-[var(--page-text)] shadow-2xl"
          >
            <div className="flex h-16 items-center justify-between border-b border-[color-mix(in_oklab,var(--page-text)_10%,transparent)] px-5">
              <span className="[font-family:var(--page-font-heading)] text-lg font-bold">
                {storeName}
              </span>
              <button
                type="button"
                aria-label={words.closeMenu}
                onClick={() => setOpen(false)}
                className={cn(ICON_BUTTON, '-mr-2')}
              >
                <X className="size-5" />
              </button>
            </div>
            <ul className="flex flex-1 flex-col overflow-y-auto px-2 py-3">
              {links.map((link, index) => (
                <li key={`${link.href}-${index}`}>
                  <a
                    href={link.href}
                    className="flex min-h-12 items-center rounded-lg px-3 text-base font-medium transition hover:bg-[color-mix(in_oklab,var(--page-text)_6%,transparent)]"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
            {showAccount && (
              <a
                href={paths.account}
                className="flex min-h-14 items-center gap-3 border-t border-[color-mix(in_oklab,var(--page-text)_10%,transparent)] px-5 text-base font-medium"
              >
                <UserRound className="size-5" />
                {words.yourAccount}
              </a>
            )}
          </El>
        </div>
      )}
    </>
  )
}
