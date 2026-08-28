import Redis from 'ioredis'

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined
}

/** Longest quiet period between two "Redis is down" lines. */
const ERROR_LOG_INTERVAL_MS = 60_000

/**
 * A failed TCP connect surfaces as an `AggregateError` whose own message is
 * empty — the useful part (`ECONNREFUSED 127.0.0.1:6379`) sits on the first
 * wrapped error.
 */
function describeError(error: Error): string {
  if (error instanceof AggregateError) {
    const [first] = error.errors
    if (first instanceof Error && first.message) return first.message
  }
  return error.message || error.name
}

function createClient() {
  if (!process.env.REDIS_URL) {
    throw new Error('REDIS_URL is not set — see .env.example')
  }

  const client = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 1,
    lazyConnect: true,
  })

  // Every call site treats Redis as an optimisation and falls back to its
  // source of truth, so an unreachable server is a degradation rather than an
  // outage. Without an `error` listener ioredis prints a full stack for each
  // failed command *and* each reconnect attempt, which buries the rest of the
  // server output when Redis simply isn't running locally. Log the first
  // failure, then at most one line a minute until it comes back.
  let suppressed = 0
  let lastLoggedAt = 0

  client.on('error', (error: Error) => {
    const now = Date.now()
    if (lastLoggedAt && now - lastLoggedAt < ERROR_LOG_INTERVAL_MS) {
      suppressed += 1
      return
    }
    const repeats =
      suppressed > 0 ? ` (${suppressed} similar errors suppressed)` : ''
    console.warn(
      `Redis unavailable: ${describeError(error)}${repeats} — caches and rate limits are bypassed until it reconnects.`
    )
    suppressed = 0
    lastLoggedAt = now
  })

  client.on('ready', () => {
    if (!lastLoggedAt) return
    console.info('Redis connection restored.')
    suppressed = 0
    lastLoggedAt = 0
  })

  return client
}

export const redis = globalForRedis.redis ?? createClient()

if (process.env.NODE_ENV !== 'production') {
  globalForRedis.redis = redis
}
