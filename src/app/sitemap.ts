import type { MetadataRoute } from 'next'
import { env } from '@/lib/env'

export default function sitemap(): MetadataRoute.Sitemap {
  const base = env.AUTH_URL.replace(/\/$/, '')

  return [
    { url: base, changeFrequency: 'monthly', priority: 1 },
    { url: `${base}/login`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${base}/register`, changeFrequency: 'yearly', priority: 0.3 },
  ]
}
