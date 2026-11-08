import 'server-only'
import { prisma } from '@/server/db/client'

/**
 * `actorUserId` is null for what no person did in that moment — a payment
 * confirmed by the gateway's webhook, say.
 */
export async function logAudit(
  actorUserId: string | null,
  action: string,
  entityType: string,
  entityId: string,
  metadata?: object
) {
  await prisma.auditLog.create({
    data: { actorUserId, action, entityType, entityId, metadata },
  })
}
