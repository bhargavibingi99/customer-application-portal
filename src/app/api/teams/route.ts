import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'

/** GET /api/teams — used by the admin user form to pick a team. */
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const teams = await prisma.team.findMany({
    select: {
      id: true,
      name: true,
      _count: { select: { members: true } },
    },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json(teams)
}
