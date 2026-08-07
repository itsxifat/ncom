import Redis from 'ioredis'

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined
}

function createClient() {
  if (!process.env.REDIS_URL) {
    throw new Error('REDIS_URL is not set — see .env.example')
  }
  return new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 1,
    lazyConnect: true,
  })
}

export const redis = globalForRedis.redis ?? createClient()

if (process.env.NODE_ENV !== 'production') {
  globalForRedis.redis = redis
}
