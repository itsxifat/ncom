import localFont from 'next/font/local'

/**
 * The taka sign (৳) NCOM writes money with, everywhere money is written: the
 * dashboard (globals.css puts it at the front of every font stack) and every
 * storefront and builder canvas (lib/fonts.ts puts it at the front of every
 * theme font's stack).
 *
 * It is the Elysium ERP's taka, Hind Siliguri's at the ERP's size — see
 * scripts/generate-taka-font.py for how the files are made and why one sign
 * everywhere beats each font's own. The `unicode-range` makes this a font for
 * exactly one character, so it can lead any stack and the browser still only
 * ever reaches for it on a "৳". The four files are about 2.5KB each, which is
 * why they are left to preload: a price
 * should not paint once in some other taka and then jump.
 *
 * Its own module so the root layout and the font catalogue load the same
 * files: next/font names a face by where it is declared, and two declarations
 * would be two faces downloaded twice.
 */
export const takaFont = localFont({
  src: [
    { path: '../app/fonts/ncom-taka-400.woff2', weight: '400' },
    { path: '../app/fonts/ncom-taka-500.woff2', weight: '500' },
    { path: '../app/fonts/ncom-taka-600.woff2', weight: '600' },
    { path: '../app/fonts/ncom-taka-700.woff2', weight: '700' },
  ],
  variable: '--font-taka',
  declarations: [{ prop: 'unicode-range', value: 'U+09F3' }],
  adjustFontFallback: false,
})
