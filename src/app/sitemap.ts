import type { MetadataRoute } from 'next'
import { env } from '@/lib/env'

export default function sitemap(): MetadataRoute.Sitemap {
  const base = env.AUTH_URL.replace(/\/$/, '')

  return [
    { url: base, changeFrequency: 'monthly', priority: 1 },
    { url: `${base}/pricing`, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${base}/contact`, changeFrequency: 'yearly', priority: 0.5 },
    // Public and worth indexing: it is how a merchant evaluating the platform
    // finds out whether it can talk to the system they already run.
    { url: `${base}/docs`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${base}/login`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${base}/register`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${base}/terms`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${base}/privacy`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${base}/refund-policy`, changeFrequency: 'yearly', priority: 0.2 },
  ]
}
