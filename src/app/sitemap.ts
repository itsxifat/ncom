import type { MetadataRoute } from 'next'
import { env } from '@/lib/env'

export default function sitemap(): MetadataRoute.Sitemap {
  const base = env.AUTH_URL.replace(/\/$/, '')

  return [
    { url: base, changeFrequency: 'monthly', priority: 1 },
    // Public and worth indexing: it is how a merchant evaluating the platform
    // finds out whether it can talk to the system they already run.
    { url: `${base}/docs`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${base}/login`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${base}/register`, changeFrequency: 'yearly', priority: 0.3 },
  ]
}
