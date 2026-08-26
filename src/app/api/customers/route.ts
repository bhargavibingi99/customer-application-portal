import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'

const MAX_PAGE_SIZE = 50
const DEFAULT_PAGE_SIZE = 10

/**
 * GET /api/customers
 *
 * Searchable, paginated customer directory.
 *
 * Customers are reference data shared by the whole company, so every
 * authenticated role can read them; it is the applications hanging off a
 * customer that are access-scoped.
 */
export async function GET(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search')?.trim()

  const where = search
    ? {
        OR: [
          { name: { contains: search } },
          { email: { contains: search } },
          { company: { contains: search } },
        ],
      }
    : {}

  const page = Math.max(1, Number(searchParams.get('page')) || 1)
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number(searchParams.get('pageSize')) || DEFAULT_PAGE_SIZE)
  )

  const [customers, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      include: { _count: { select: { applications: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.customer.count({ where }),
  ])

  return NextResponse.json({
    data: customers,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  })
}

/** POST /api/customers — create a customer record. */
export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const company = typeof body.company === 'string' ? body.company.trim() : ''
    const phone = typeof body.phone === 'string' && body.phone.trim() ? body.phone.trim() : null

    if (!name || !email || !company) {
      return NextResponse.json(
        { error: 'Name, email and company are all required.' },
        { status: 400 }
      )
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Please provide a valid email address.' }, { status: 400 })
    }

    const duplicate = await prisma.customer.findUnique({ where: { email } })
    if (duplicate) {
      return NextResponse.json(
        { error: 'A customer with that email address already exists.' },
        { status: 409 }
      )
    }

    const customer = await prisma.customer.create({
      data: { name, email, company, phone },
      include: { _count: { select: { applications: true } } },
    })

    return NextResponse.json(customer, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not create customer.' },
      { status: 400 }
    )
  }
}
