import type { PageTheme } from './types'

/**
 * The languages a site can speak to its shoppers.
 *
 * Deliberately two. NCOM sells to Bangladeshi merchants, whose shops are
 * written in Bangla or in English — often a mix, with Bangla copy and English
 * product names — and every string NCOM itself puts on a storefront exists in
 * both. A third language is a dictionary and a template pass away; adding it to
 * this list without them would ship a storefront that switches language
 * halfway down the checkout.
 *
 * The dashboard is not translated by this. The merchant's workspace stays in
 * the language it is in; this is what their *customers* read.
 */
export const SITE_LANGUAGES = ['en', 'bn'] as const
export type SiteLanguage = (typeof SITE_LANGUAGES)[number]

export const SITE_LANGUAGE_LABELS: Record<SiteLanguage, string> = {
  en: 'English',
  bn: 'বাংলা',
}

/** How a site writes numbers: `1,250` or `১,২৫০`. */
export const SITE_NUMERALS = ['latin', 'bangla'] as const
export type SiteNumerals = (typeof SITE_NUMERALS)[number]

export function isSiteLanguage(value: unknown): value is SiteLanguage {
  return value === 'en' || value === 'bn'
}

/** The theme's language, defaulting to English for themes older than it. */
export function siteLanguage(
  theme: Pick<PageTheme, 'language'> | null | undefined
): SiteLanguage {
  return isSiteLanguage(theme?.language) ? theme.language : 'en'
}

/**
 * How the site writes its numbers. Bangla digits only on a Bangla site:
 * "Add to cart" beside "৳১,২৫০" is a mix no shop means to show, and the theme
 * form is not the only thing that writes a theme — the AI editor tools and
 * older rows can pair English with Bangla digits — so the rule is applied
 * here, where every storefront reads it, rather than trusted to each writer.
 */
export function siteNumerals(
  theme: Pick<PageTheme, 'language' | 'numerals'> | null | undefined
): SiteNumerals {
  return siteLanguage(theme) === 'bn' && theme?.numerals === 'bangla'
    ? 'bangla'
    : 'latin'
}

const BANGLA_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯']

/**
 * The first digit of each set a shopper's keyboard may type in place of 0-9:
 * Bangla, Devanagari, Arabic-Indic and the Persian/Urdu form of it. Each set
 * runs zero to nine in order, so a digit's value is its distance from zero.
 */
const DIGIT_ZEROS = [0x09e6, 0x0966, 0x0660, 0x06f0]
const NON_LATIN_DIGIT = /[০-৯०-९٠-٩۰-۹]/g

/**
 * Rewrites any Bangla (or other script's) digits in a string as 0-9.
 *
 * The reverse of `localizeDigits`, for what a shopper types rather than what a
 * page draws. A phone number typed on a Bangla keyboard — "০১৭১২৩৪৫৬৭৮" — is
 * a perfectly good number, but a pattern written with `\d` does not see digits
 * in it, and a courier's or a fraud check's API does not either. Converted at
 * the door, it is validated and stored the one way everything downstream reads.
 */
export function latinDigits(text: string): string {
  return text.replace(NON_LATIN_DIGIT, (digit) => {
    const code = digit.charCodeAt(0)
    const zero = DIGIT_ZEROS.find((start) => code >= start && code <= start + 9)
    return String(code - (zero ?? code))
  })
}

/**
 * Rewrites the digits in a string as Bangla digits when the site asks for
 * them, and leaves everything else — separators, the currency sign, letters —
 * exactly as it was. Formatting stays the job of whoever built the string; this
 * only changes how its digits are drawn.
 */
export function localizeDigits(text: string, numerals: SiteNumerals): string {
  if (numerals !== 'bangla') return text
  return text.replace(/[0-9]/g, (digit) => BANGLA_DIGITS[Number(digit)]!)
}

/** The value for an element's `lang` attribute. */
export function htmlLang(language: SiteLanguage): string {
  return language === 'bn' ? 'bn' : 'en'
}
