import { GOOGLE_FONTS } from '@/lib/google-fonts'

/**
 * GET /api/fonts/list
 *
 * Every Google Fonts family the font picker offers, most used first. The list
 * is the snapshot in lib/google-fonts.json, so it changes only with a deploy:
 * the browser keeps it for a day, and the picker downloads it once rather than
 * carrying it in every bundle that touches a font. Weights and italics stay
 * on the server — the font proxy is what needs them.
 */

const BODY = JSON.stringify({
  families: [...GOOGLE_FONTS]
    .sort((a, b) => a.popularity - b.popularity)
    .map(({ family, category, bangla, popularity }) => ({
      family,
      category,
      bangla,
      popularity,
    })),
})

export function GET() {
  return new Response(BODY, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
    },
  })
}

export const runtime = 'nodejs'
