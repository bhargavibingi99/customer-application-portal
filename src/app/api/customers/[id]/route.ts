import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { applicationVisibilityFilter } from '@/lib/workflow'

type RouteContext = { params: { id: string } }

/**
 * GET /api/customers/[id]
 *
 * Customer profile plus the applications belonging to them.
 *
 * The nested application list is filtered by the caller's visibility scope, so
 * an executive browsing a customer only sees their own cases rather than the
 * whole relationship.
 */
export async function GET(_req: Request, { params }: RouteContext) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const customer = await prisma.customer.findUnique({ where: { id: params.id } })

  if (!customer) {
    return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
  }

  const visibility = applicationVisibilityFilter({
    id: user.id,
    role: user.role,
    teamId: user.teamId,
  })

  const applications = await prisma.application.findMany({
    where: { AND: [{ customerId: params.id }, visibility] },
    include: {
      assignedUser: true,
      workItems: { select: { id: true, status: true } },
    },
    orderBy: { updatedAt: 'desc' },
  })

  return NextResponse.json({ ...customer, applications })
}
