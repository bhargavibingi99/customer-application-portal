import { prisma } from './prisma'
import { syncCompletedApplication } from './externalSync'

/**
 * Server-side helpers shared by the application API routes, so the query shape
 * and the synchronisation procedure exist in exactly one place.
 */

/** Everything the detail screen needs in a single round trip. */
export const applicationInclude = {
  customer: true,
  assignedUser: { include: { team: true } },
  workItems: {
    include: { assignedUser: true },
    orderBy: { createdAt: 'asc' as const },
  },
  activityLogs: {
    include: { user: true },
    orderBy: { createdAt: 'desc' as const },
  },
}

export function getApplication(id: string) {
  return prisma.application.findUnique({ where: { id }, include: applicationInclude })
}

/**
 * Attempts to push a completed application to the external system and records
 * the outcome.
 *
 * Important: this never throws and never changes `stage`. Synchronisation is
 * tracked alongside the application rather than gating it, so a failing external
 * system cannot stop work from being completed locally.
 */
export async function runExternalSync({
  applicationId,
  origin,
  actorId,
  isRetry = false,
}: {
  applicationId: string
  origin: string
  actorId: string | null
  isRetry?: boolean
}) {
  const application = await prisma.application.findUnique({ where: { id: applicationId } })
  if (!application) return null

  const result = await syncCompletedApplication({
    applicationId: application.id,
    idempotencyKey: application.idempotencyKey,
    origin,
    // Only selected fields are mirrored outward, not the whole record.
    snapshot: {
      title: application.title,
      stage: application.stage,
      priority: application.priority,
      customerId: application.customerId,
      completedAt: application.updatedAt,
    },
  })

  const attemptLabel = isRetry ? 'Retry' : 'Sync'

  return prisma.application.update({
    where: { id: application.id },
    data: {
      syncStatus: result.success ? 'SUCCESS' : 'FAILED',
      syncAttempts: { increment: 1 },
      lastSyncError: result.success ? null : result.error,
      lastSyncedAt: result.success ? new Date() : application.lastSyncedAt,
      activityLogs: {
        create: {
          action: result.success ? 'SYNC_SUCCEEDED' : 'SYNC_FAILED',
          details: result.success
            ? result.outcome === 'ALREADY_PROCESSED'
              ? `${attemptLabel} confirmed the external system had already recorded this application (duplicate ignored, ${result.durationMs}ms)`
              : `${attemptLabel} completed successfully in ${result.durationMs}ms`
            : `${attemptLabel} failed after ${result.durationMs}ms: ${result.error}`,
          userId: actorId,
        },
      },
    },
    include: applicationInclude,
  })
}
