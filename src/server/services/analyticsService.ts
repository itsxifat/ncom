import 'server-only'
import { createHash } from 'crypto'
import { prisma } from '@/server/db/client'

/**
 * No raw PII stored: the hash rotates daily (today's date is folded into
 * the input) so the same visitor can't be correlated across days, and
 * nothing here needs cookie consent — it's a server-side count, not a
 * client-side tracker.
 */
function hashVisitor(ip: string, userAgent: string): string {
  const today = new Date().toISOString().slice(0, 10)
  return createHash('sha256')
    .update(`${ip}:${userAgent}:${today}`)
    .digest('hex')
}

export async function recordPageView(input: {
  pageId: string
  projectId: string
  path: string
  referrer: string | null
  userAgent: string
  ip: string
}) {
  try {
    await prisma.pageView.create({
      data: {
        pageId: input.pageId,
        projectId: input.projectId,
        path: input.path,
        referrer: input.referrer,
        visitorHash: hashVisitor(input.ip, input.userAgent),
      },
    })
  } catch (error) {
    // Analytics must never break the page render.
    console.error('Failed to record page view:', error)
  }
}
