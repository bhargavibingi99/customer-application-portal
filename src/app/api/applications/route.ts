import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import {
  applicationVisibilityFilter,
  canAssign,
  isApplicationStage,
  isPriority,
  type Role,
} from '@/lib/workflow'

const MAX_PAGE_SIZE = 50
const DEFAULT_PAGE_SIZE = 10

/**
 * GET /api/applications
 *
 * Supports search, stage/priority/assignee filtering and pagination.
 * Results are always narrowed by the caller's visibility scope first, so a
 * client cannot widen what it sees by omitting or forging query parameters.
 */
export async function GET(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const stage = searchParams.get('stage')
  const priority = searchParams.get('priority')
  const assignedUserId = searchParams.get('assignedUserId')
  const search = searchParams.get('search')?.trim()

  const filters: Record<string, unknown>[] = [
    applicationVisibilityFilter({ id: user.id, role: user.role, teamId: user.teamId }),
  ]

  if (stage && isApplicationStage(stage)) filters.push({ stage })
  if (priority && isPriority(priority)) filters.push({ priority })
  if (assignedUserId) filters.push({ assignedUserId })

  if (search) {
    filters.push({
      OR: [
        { title: { contains: search } },
        { description: { contains: search } },
        { customer: { name: { contains: search } } },
        { customer: { company: { contains: search } } },
        { customer: { email: { contains: search } } },
      ],
    })
  }

  const where = { AND: filters }

  const page = Math.max(1, Number(searchParams.get('page')) || 1)
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number(searchParams.get('pageSize')) || DEFAULT_PAGE_SIZE)
  )

  const [applications, total] = await Promise.all([
    prisma.application.findMany({
      where,
      include: {
        customer: true,
        assignedUser: true,
        workItems: { select: { id: true, status: true } },
      },
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.application.count({ where }),
  ])

  return NextResponse.json({
    data: applications,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  })
}

/**
 * POST /api/applications
 *
 * Any authenticated user may raise an application. Only roles with assignment
 * authority may set the initial assignee; for anyone else the application is
 * created unassigned for a manager to triage.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const title = typeof body.title === 'string' ? body.title.trim() : ''
    const description = typeof body.description === 'string' ? body.description.trim() : ''
    const { priority, customerId, assignedUserId } = body

    if (!title || !description || !customerId) {
      return NextResponse.json(
        { error: 'Title, description and customer are all required.' },
        { status: 400 }
      )
    }

    const customer = await prisma.customer.findUnique({ where: { id: customerId } })
    if (!customer) {
      return NextResponse.json({ error: 'Selected customer does not exist.' }, { status: 400 })
    }

    let initialAssignee: string | null = null

    if (assignedUserId && canAssign(user.role as Role)) {
      const assignee = await prisma.user.findUnique({ where: { id: assignedUserId } })
      if (!assignee) {
        return NextResponse.json({ error: 'Selected assignee does not exist.' }, { status: 400 })
      }
      // A manager may only hand work to their own team.
      if (user.role === 'MANAGER' && assignee.teamId !== user.teamId) {
        return NextResponse.json(
          { error: 'Managers can only assign applications to members of their own team.' },
          { status: 403 }
        )
      }
      initialAssignee = assignee.id
    }

    const application = await prisma.application.create({
      data: {
        title,
        description,
        priority: isPriority(priority) ? priority : 'MEDIUM',
        customerId,
        assignedUserId: initialAssignee,
        activityLogs: {
          create: [
            { action: 'CREATED', details: `Application created by ${user.name}`, userId: user.id },
            ...(initialAssignee
              ? [
                  {
                    action: 'ASSIGNED',
                    details: 'Application assigned on creation',
                    userId: user.id,
                  },
                ]
              : []),
          ],
        },
      },
      include: { customer: true, assignedUser: true },
    })

    return NextResponse.json(application, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not create application.' },
      { status: 400 }
    )
  }
}
