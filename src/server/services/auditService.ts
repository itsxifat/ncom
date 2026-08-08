import 'server-only'
import { prisma } from '@/server/db/client'

export async function logAudit(
  actorUserId: string,
  action: string,
  entityType: string,
  entityId: string,
  metadata?: object
) {
  await prisma.auditLog.create({
    data: { actorUserId, action, entityType, entityId, metadata },
  })
}
