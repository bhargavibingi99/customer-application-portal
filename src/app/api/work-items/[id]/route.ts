import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { canViewApplication, isWorkItemStatus } from '@/lib/workflow'

type RouteContext = { params: { id: string } }

/**
 * PATCH /api/work-items/[id]
 *
 * Updates a work item's title, status or assignee. Status changes are recorded
 * in the parent application's activity history so progress is auditable.
 */
export async function PATCH(req: Request, { params }: RouteContext) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()

    const existing = await prisma.workItem.findUnique({
      where: { id: params.id },
      include: {
        assignedUser: true,
        application: { include: { assignedUser: true } },
      },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Work item not found' }, { status: 404 })
    }

    const actor = { id: user.id, role: user.role, teamId: user.teamId }
    if (!canViewApplication(actor, existing.application)) {
      return NextResponse.json(
        { error: 'You do not have access to this work item.' },
        { status: 403 }
      )
    }

    const updates: Record<string, unknown> = {}
    const events: Array<{ action: string; details: string }> = []

    if (typeof body.title === 'string') {
      const title = body.title.trim()
      if (!title) {
        return NextResponse.json({ error: 'Work item title cannot be empty.' }, { status: 400 })
      }
      if (title !== existing.title) updates.title = title
    }

    if (body.status !== undefined && body.status !== existing.status) {
      if (!isWorkItemStatus(body.status)) {
        return NextResponse.json({ error: `Invalid work item status: ${body.status}` }, { status: 400 })
      }

      updates.status = body.status
      updates.completedAt = body.status === 'COMPLETED' ? new Date() : null

      events.push({
        action: body.status === 'COMPLETED' ? 'WORK_ITEM_COMPLETED' : 'WORK_ITEM_UPDATED',
        details:
          body.status === 'COMPLETED'
            ? `Work item "${existing.title}" completed by ${user.name}`
            : `Work item "${existing.title}" moved to ${body.status.replace(/_/g, ' ').toLowerCase()}`,
      })
    }

    if (body.assignedUserId !== undefined && body.assignedUserId !== existing.assignedUserId) {
      let assigneeName = 'Unassigned'

      if (body.assignedUserId !== null) {
        const assignee = await prisma.user.findUnique({ where: { id: body.assignedUserId } })
        if (!assignee) {
          return NextResponse.json({ error: 'Selected assignee does not exist.' }, { status: 400 })
        }
        assigneeName = assignee.name
      }

      updates.assignedUserId = body.assignedUserId
      events.push({
        action: 'WORK_ITEM_ASSIGNED',
        details: `Work item "${existing.title}" assigned to ${assigneeName}`,
      })
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(existing)
    }

    const [workItem] = await prisma.$transaction([
      prisma.workItem.update({
        where: { id: params.id },
        data: updates,
        include: { assignedUser: true },
      }),
      ...events.map((event) =>
        prisma.activityLog.create({
          data: { ...event, applicationId: existing.applicationId, userId: user.id },
        })
      ),
    ])

    return NextResponse.json(workItem)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not update work item.' },
      { status: 400 }
    )
  }
}

/** Removes a work item that was added by mistake. */
export async function DELETE(_req: Request, { params }: RouteContext) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const existing = await prisma.workItem.findUnique({
    where: { id: params.id },
    include: { application: { include: { assignedUser: true } } },
  })

  if (!existing) {
    return NextResponse.json({ error: 'Work item not found' }, { status: 404 })
  }

  const actor = { id: user.id, role: user.role, teamId: user.teamId }
  if (!canViewApplication(actor, existing.application)) {
    return NextResponse.json({ error: 'You do not have access to this work item.' }, { status: 403 })
  }

  await prisma.$transaction([
    prisma.workItem.delete({ where: { id: params.id } }),
    prisma.activityLog.create({
      data: {
        action: 'WORK_ITEM_REMOVED',
        details: `Work item "${existing.title}" removed`,
        applicationId: existing.applicationId,
        userId: user.id,
      },
    }),
  ])

  return NextResponse.json({ success: true })
}
