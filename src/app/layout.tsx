import type { Metadata } from 'next'
import { Manrope, Space_Grotesk, Geist_Mono } from 'next/font/google'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import { SessionProvider } from '@/components/session-provider'
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

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    // `dark` is set here rather than by a theme provider because NCOM is a
    // black-surfaced product, not a product with a dark mode: the lime brand mark
    // is built for an ink ground and every surface is designed around that. A
    // class on the server-rendered <html> also means no hydration flash and no
    // client JavaScript deciding what colour the page is.
    //
    // Tenant storefronts are unaffected. They render through `PageThemeProvider`,
    // which namespaces its variables under `--page-*` and sets its own
    // background, so a merchant's own theme still wins on their own domain.
    <html
      lang="en"
      className={`dark ${manrope.variable} ${spaceGrotesk.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <SessionProvider>
          <TooltipProvider>
            {children}
            <Toaster />
          </TooltipProvider>
        </SessionProvider>
      </body>
    </html>
  )
}
