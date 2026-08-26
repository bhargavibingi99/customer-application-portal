import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { canManageUsers, isRole } from '@/lib/workflow'

const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  createdAt: true,
  team: { select: { id: true, name: true } },
  _count: { select: { applications: true } },
}

/**
 * GET /api/users
 *
 * Feeds the assignee pickers and the admin user list.
 *
 * The result is scoped to match assignment authority: an administrator sees
 * everyone, while a manager only sees their own team because that is the only
 * group they are permitted to assign work to.
 */
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const where = user.role === 'ADMIN' ? {} : { teamId: user.teamId }

  const users = await prisma.user.findMany({
    where,
    select: userSelect,
    orderBy: [{ role: 'asc' }, { name: 'asc' }],
  })

  return NextResponse.json(users)
}

/**
 * POST /api/users
 *
 * Administrator-only user provisioning.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!canManageUsers(user.role as 'ADMIN' | 'MANAGER' | 'EXECUTIVE')) {
    return NextResponse.json(
      { error: 'Only an administrator can manage users.' },
      { status: 403 }
    )
  }

  try {
    const body = await req.json()
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const { role, teamId } = body

    if (!name || !email) {
      return NextResponse.json({ error: 'Name and email are required.' }, { status: 400 })
    }

    if (!isRole(role)) {
      return NextResponse.json({ error: `Invalid role: ${role}` }, { status: 400 })
    }

    const duplicate = await prisma.user.findUnique({ where: { email } })
    if (duplicate) {
      return NextResponse.json(
        { error: 'A user with that email address already exists.' },
        { status: 409 }
      )
    }

    if (teamId) {
      const team = await prisma.team.findUnique({ where: { id: teamId } })
      if (!team) {
        return NextResponse.json({ error: 'Selected team does not exist.' }, { status: 400 })
      }
    }

    const created = await prisma.user.create({
      data: { name, email, role, teamId: teamId || null },
      select: userSelect,
    })

    return NextResponse.json(created, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not create user.' },
      { status: 400 }
    )
  }
}
