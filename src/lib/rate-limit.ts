import 'server-only'
import { headers } from 'next/headers'
import { redis } from '@/server/redis/client'

export type RateLimitResult = { allowed: boolean; retryAfterSeconds?: number }

/**
 * Fixed-window rate limiter backed by Redis. Fails open (allows the
 * request) if Redis is unreachable — a rate limiter outage should degrade
 * to "unlimited," not take down auth entirely.
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  try {
    const redisKey = `ratelimit:${key}`
    const count = await redis.incr(redisKey)
    if (count === 1) {
      await redis.expire(redisKey, windowSeconds)
    }
    if (count > limit) {
      const ttl = await redis.ttl(redisKey)
      return {
        allowed: false,
        retryAfterSeconds: ttl > 0 ? ttl : windowSeconds,
      }
    }
    return { allowed: true }
  } catch (error) {
    console.error('Rate limit check failed, allowing request:', error)
    return { allowed: true }
  }
}

/**
 * Best-effort client IP from proxy headers (set by Vercel, most reverse
 * proxies/load balancers). Falls back to a shared bucket when absent —
 * true in local dev without a proxy in front, where per-IP limiting isn't
 * meaningful anyway.
 */
export async function getClientIp(): Promise<string> {
  const headerList = await headers()
  const forwardedFor = headerList.get('x-forwarded-for')
  if (forwardedFor) return forwardedFor.split(',')[0]!.trim()

  const realIp = headerList.get('x-real-ip')
  if (realIp) return realIp

  return 'unknown'
}
