import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { canViewApplication, isWorkItemStatus } from '@/lib/workflow'

type RouteContext = { params: { id: string } }

/**
 * POST /api/applications/[id]/work-items
 *
 * Adds a piece of work to an application. Anyone who can see the application
 * may break it down, because that is the day-to-day job of the executive who
 * owns it as much as the manager overseeing it.
 */
export async function POST(req: Request, { params }: RouteContext) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const title = typeof body.title === 'string' ? body.title.trim() : ''

    if (!title) {
      return NextResponse.json({ error: 'Work item title is required.' }, { status: 400 })
    }

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

    if (application.stage === 'COMPLETED') {
      return NextResponse.json(
        { error: 'Cannot add work to an application that is already completed.' },
        { status: 409 }
      )
    }

    const status = isWorkItemStatus(body.status) ? body.status : 'PENDING'

    let assignedUserId: string | null = null
    if (body.assignedUserId) {
      const assignee = await prisma.user.findUnique({ where: { id: body.assignedUserId } })
      if (!assignee) {
        return NextResponse.json({ error: 'Selected assignee does not exist.' }, { status: 400 })
      }
      assignedUserId = assignee.id
    }

    const [workItem] = await prisma.$transaction([
      prisma.workItem.create({
        data: {
          title,
          status,
          applicationId: params.id,
          assignedUserId,
          completedAt: status === 'COMPLETED' ? new Date() : null,
        },
        include: { assignedUser: true },
      }),
      prisma.activityLog.create({
        data: {
          action: 'WORK_ITEM_CREATED',
          details: `Work item "${title}" added`,
          applicationId: params.id,
          userId: user.id,
        },
      }),
    ])

    return NextResponse.json(workItem, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not create work item.' },
      { status: 400 }
    )
  }
}
