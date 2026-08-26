import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { runExternalSync } from '@/lib/applications'
import { canViewApplication } from '@/lib/workflow'

type RouteContext = { params: { id: string } }

/**
 * POST /api/applications/[id]/retry-sync
 *
 * Manual recovery path for a synchronisation that previously failed.
 *
 * The original idempotency key is reused, so if the external system actually
 * did receive the first request it reports ALREADY_PROCESSED and we settle on
 * success rather than creating a duplicate record downstream.
 */
export async function POST(req: Request, { params }: RouteContext) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const application = await prisma.application.findUnique({
    where: { id: params.id },
    include: { assignedUser: true },
  })

  if (!application) {
    return NextResponse.json({ error: 'Application not found' }, { status: 404 })
  }

  const actor = { id: user.id, role: user.role, teamId: user.teamId }
  if (!canViewApplication(actor, application)) {
    return NextResponse.json(
      { error: 'You do not have access to this application.' },
      { status: 403 }
    )
  }

  if (application.stage !== 'COMPLETED') {
    return NextResponse.json(
      { error: 'Only completed applications are synchronised with the external system.' },
      { status: 400 }
    )
  }

  if (application.syncStatus === 'SUCCESS') {
    return NextResponse.json(
      { error: 'This application has already been synchronised successfully.' },
      { status: 409 }
    )
  }

  const updated = await runExternalSync({
    applicationId: application.id,
    origin: new URL(req.url).origin,
    actorId: user.id,
    isRetry: true,
  })

  return NextResponse.json(updated)
}
