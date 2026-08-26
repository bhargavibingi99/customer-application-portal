import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { applicationInclude, getApplication, runExternalSync } from '@/lib/applications'
import {
  canAssign,
  canEditPriority,
  canViewApplication,
  isApplicationStage,
  isPriority,
  validateStageTransition,
  type ApplicationStage,
  type Role,
} from '@/lib/workflow'

type RouteContext = { params: { id: string } }

export async function GET(_req: Request, { params }: RouteContext) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const application = await getApplication(params.id)
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

  return NextResponse.json(application)
}

/**
 * PATCH /api/applications/[id]
 *
 * Handles detail edits, assignment/reassignment and stage transitions in one
 * place, because they share the same concurrency guard.
 *
 * Concurrency: the caller must send the `version` it read. The write is applied
 * with `updateMany ... where version = <expected>`; if another user has since
 * saved, zero rows match and we surface 409 instead of silently overwriting.
 *
 * Authority is taken from the session, never from the request body.
 */
export async function PATCH(req: Request, { params }: RouteContext) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = user.role as Role

  try {
    const body = await req.json()
    const expectedVersion = Number(body.version)

    if (!Number.isInteger(expectedVersion)) {
      return NextResponse.json(
        { error: 'A valid version is required so concurrent edits can be detected.' },
        { status: 400 }
      )
    }

    const existing = await prisma.application.findUnique({
      where: { id: params.id },
      include: { assignedUser: true },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 })
    }

    const actor = { id: user.id, role: user.role, teamId: user.teamId }
    if (!canViewApplication(actor, existing)) {
      return NextResponse.json(
        { error: 'You do not have access to this application.' },
        { status: 403 }
      )
    }

    const currentStage = existing.stage
    if (!isApplicationStage(currentStage)) {
      return NextResponse.json(
        { error: `Application is in an unrecognised stage: ${currentStage}` },
        { status: 500 }
      )
    }

    const updates: Record<string, unknown> = {}
    const events: Array<{ action: string; details: string; userId: string | null }> = []
    const fieldChanges: string[] = []

    // --- plain detail edits -------------------------------------------------
    if (typeof body.title === 'string') {
      const title = body.title.trim()
      if (!title) {
        return NextResponse.json({ error: 'Title cannot be empty.' }, { status: 400 })
      }
      if (title !== existing.title) {
        updates.title = title
        fieldChanges.push(`title changed to "${title}"`)
      }
    }

    if (typeof body.description === 'string') {
      const description = body.description.trim()
      if (!description) {
        return NextResponse.json({ error: 'Description cannot be empty.' }, { status: 400 })
      }
      if (description !== existing.description) {
        updates.description = description
        fieldChanges.push('description updated')
      }
    }

    // --- priority -----------------------------------------------------------
    if (body.priority !== undefined && body.priority !== existing.priority) {
      if (!isPriority(body.priority)) {
        return NextResponse.json({ error: `Invalid priority: ${body.priority}` }, { status: 400 })
      }
      if (!canEditPriority(role)) {
        return NextResponse.json(
          { error: 'Only a manager or administrator can change priority.' },
          { status: 403 }
        )
      }
      updates.priority = body.priority
      fieldChanges.push(`priority changed to ${body.priority}`)
    }

    // --- assignment ---------------------------------------------------------
    if (body.assignedUserId !== undefined && body.assignedUserId !== existing.assignedUserId) {
      if (!canAssign(role)) {
        return NextResponse.json(
          { error: 'Only a manager or administrator can assign or reassign applications.' },
          { status: 403 }
        )
      }

      let assigneeName = 'Unassigned'

      if (body.assignedUserId !== null) {
        const assignee = await prisma.user.findUnique({ where: { id: body.assignedUserId } })
        if (!assignee) {
          return NextResponse.json({ error: 'Selected assignee does not exist.' }, { status: 400 })
        }
        if (role === 'MANAGER' && assignee.teamId !== user.teamId) {
          return NextResponse.json(
            { error: 'Managers can only assign applications to members of their own team.' },
            { status: 403 }
          )
        }
        assigneeName = assignee.name
      }

      updates.assignedUserId = body.assignedUserId
      events.push({
        action: existing.assignedUserId ? 'REASSIGNED' : 'ASSIGNED',
        details: existing.assignedUserId
          ? `Reassigned from ${existing.assignedUser?.name ?? 'Unassigned'} to ${assigneeName}`
          : `Assigned to ${assigneeName}`,
        userId: user.id,
      })
    }

    // --- stage transition ---------------------------------------------------
    let nextStage: ApplicationStage | null = null

    if (body.stage !== undefined) {
      if (!isApplicationStage(body.stage)) {
        return NextResponse.json({ error: `Invalid stage: ${body.stage}` }, { status: 400 })
      }

      const requested: ApplicationStage = body.stage
      const isAssignee = existing.assignedUserId === user.id
      const check = validateStageTransition(currentStage, requested, role, isAssignee)

      if (!check.valid) {
        return NextResponse.json({ error: check.reason }, { status: 403 })
      }

      if (requested !== currentStage) {
        nextStage = requested
        updates.stage = requested
        const reopening = currentStage === 'COMPLETED'
        events.push({
          action: reopening ? 'REOPENED' : 'STAGE_CHANGED',
          details: reopening
            ? `Application reopened from COMPLETED into ${requested}`
            : `Stage moved from ${currentStage} to ${requested}`,
          userId: user.id,
        })
      }
    }

    if (fieldChanges.length > 0) {
      events.push({ action: 'UPDATED', details: fieldChanges.join('; '), userId: user.id })
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(await getApplication(params.id))
    }

    const isCompleting = nextStage === 'COMPLETED'
    const isReopening = currentStage === 'COMPLETED' && nextStage !== null

    if (isCompleting) {
      // Mark sync as outstanding; the attempt itself happens after the commit.
      updates.syncStatus = 'PENDING'
      updates.lastSyncError = null
    }

    if (isReopening) {
      updates.syncStatus = 'NOT_REQUIRED'
    }

    updates.version = { increment: 1 }

    await prisma.$transaction(async (tx) => {
      // Optimistic lock: only succeeds if nobody else has written since we read.
      const result = await tx.application.updateMany({
        where: { id: params.id, version: expectedVersion },
        data: updates,
      })

      if (result.count === 0) throw new Error('VERSION_CONFLICT')

      if (events.length > 0) {
        await tx.activityLog.createMany({
          data: events.map((event) => ({ ...event, applicationId: params.id })),
        })
      }
    })

    // The local transaction is already durable at this point. Synchronisation is
    // attempted afterwards precisely so that a failure cannot roll it back.
    if (isCompleting) {
      const synced = await runExternalSync({
        applicationId: params.id,
        origin: new URL(req.url).origin,
        actorId: user.id,
      })
      if (synced) return NextResponse.json(synced)
    }

    return NextResponse.json(await getApplication(params.id))
  } catch (error) {
    if (error instanceof Error && error.message === 'VERSION_CONFLICT') {
      return NextResponse.json(
        {
          error:
            'Someone else updated this application while you were editing. Reload to see their changes, then reapply yours.',
          code: 'VERSION_CONFLICT',
        },
        { status: 409 }
      )
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unexpected error' },
      { status: 400 }
    )
  }
}
