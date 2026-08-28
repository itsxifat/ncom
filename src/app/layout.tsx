import type { Metadata, Viewport } from 'next'
import { Manrope, Space_Grotesk, Geist_Mono } from 'next/font/google'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import { SessionProvider } from '@/components/session-provider'
import { ThemeProvider } from '@/components/theme-provider'
import { BRAND_NAME, BRAND_SQUARE } from '@/lib/brand'
import { env } from '@/lib/env'
import './globals.css'

// Manrope reads as the quiet, slightly rounded grotesk the workspace runs on;
// Space Grotesk carries every heading and metric, where its squared counters
// and single-storey `g` give the numbers an instrument-panel feel.
const manrope = Manrope({
  variable: '--font-manrope',
  subsets: ['latin'],
})

const spaceGrotesk = Space_Grotesk({
  variable: '--font-space-grotesk',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

// `icon.png`, `apple-icon.png` and `favicon.ico` in this directory are picked up
// by the App Router automatically and emitted as the right <link> tags, so there
// is deliberately no `icons` key here to drift out of sync with the files.
// All three are generated from the wordmark by scripts/generate-app-icons.mjs.
export const metadata: Metadata = {
  // Absolute URLs are required for social cards; without a base, `openGraph.images`
  // below would be emitted as a relative path that no crawler can fetch.
  metadataBase: new URL(env.AUTH_URL),
  title: { default: BRAND_NAME, template: `%s · ${BRAND_NAME}` },
  description: 'Build and publish landing pages, visually.',
  openGraph: {
    title: BRAND_NAME,
    description: 'Build and publish landing pages, visually.',
    siteName: BRAND_NAME,
    images: [
      {
        // The square lockup, which is what every social platform crops toward.
        url: BRAND_SQUARE.src,
        width: BRAND_SQUARE.width,
        height: BRAND_SQUARE.height,
        alt: BRAND_NAME,
      },
    ],
  },
  twitter: { card: 'summary', title: BRAND_NAME },
}

/*
 * `viewportFit: 'cover'` is what lets the page paint into the rounded corners
 * and the home-indicator strip on a phone, and it is also what makes the
 * `env(safe-area-inset-*)` values in globals.css report anything other than
 * zero. The mobile tab bar depends on both.
 *
 * `themeColor` is the browser's own chrome — the status bar on Android, the
 * surrounding UI in an installed PWA. It follows the OS preference rather than
 * the in-app choice, because it is emitted as static markup and cannot know
 * what the user picked; the two colours are the two canvases, so a system-dark
 * phone gets a charcoal bar and a system-light one gets the cool grey.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#eceef1' },
    { media: '(prefers-color-scheme: dark)', color: '#131316' },
  ],
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    // The theme class is written onto this element by next-themes' inline
    // script before first paint, which is why `suppressHydrationWarning` is
    // required here: the server cannot know the visitor's stored preference, so
    // the markup it emits and the DOM React hydrates against legitimately
    // disagree on this one attribute. The warning is suppressed on <html>
    // alone, so a real mismatch anywhere inside the tree still reports.
    //
    // The workspace rail opts out of all of this and stays black in both
    // themes; see the note on `.dark` in globals.css.
    //
    // Tenant storefronts are unaffected either way. They render through
    // `PageThemeProvider`, which namespaces its variables under `--page-*` and
    // sets its own background, so a merchant's own theme still wins on their
    // own domain — and a merchant who prefers dark mode in the workspace does
    // not thereby darken the storefront their customers see.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${manrope.variable} ${spaceGrotesk.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <ThemeProvider>
          <SessionProvider>
            <TooltipProvider>
              {children}
              <Toaster />
            </TooltipProvider>
          </SessionProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
