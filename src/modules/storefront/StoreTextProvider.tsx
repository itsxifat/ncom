'use client'

import { createContext, useContext } from 'react'
import type { SiteLanguage, SiteNumerals } from '@/modules/sections/language'
import { DEFAULT_STORE_TEXT, makeStoreText, type StoreText } from './i18n'

const StoreTextContext = createContext<StoreText>(DEFAULT_STORE_TEXT)

/**
 * The storefront's language, for the client components inside a page.
 *
 * Only the two settings cross from the server — the dictionaries hold
 * functions, which cannot be sent to the browser, and they are already in the
 * client bundle anyway. Rendered by `PageThemeProvider`, so the canvas, the
 * previews and the live site all speak the language the theme says.
 */
export function StoreTextProvider({
  language,
  numerals,
  children,
}: {
  language: SiteLanguage
  numerals: SiteNumerals
  children: React.ReactNode
}) {
  return (
    <StoreTextContext.Provider value={makeStoreText(language, numerals)}>
      {children}
    </StoreTextContext.Provider>
  )
}

/** The words and number formatting of the storefront this renders in. */
export function useStoreText(): StoreText {
  return useContext(StoreTextContext)
}
