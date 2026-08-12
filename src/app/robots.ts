import type { MetadataRoute } from 'next'
import { env } from '@/lib/env'

export default function robots(): MetadataRoute.Robots {
  const base = env.AUTH_URL.replace(/\/$/, '')

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/dashboard', '/admin', '/stores', '/account', '/preview'],
    },
    sitemap: `${base}/sitemap.xml`,
  }
}
