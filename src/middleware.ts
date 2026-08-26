import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Paths that never require a session.
 *
 * NOTE: middleware runs on the Edge runtime, where Prisma is not available.
 * That means we can only check whether a session cookie is *present* here,
 * not whether it points at a real user. Validity is checked in the API layer
 * (getCurrentUser) and recovered from on the login page, which is why /login
 * must always stay reachable even when a (possibly stale) cookie exists.
 */
const PUBLIC_PATHS = ['/login', '/api/auth']

export function middleware(req: NextRequest) {
  const hasSessionCookie = Boolean(req.cookies.get('cap_session')?.value)
  const { pathname } = req.nextUrl

  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  )

  if (!hasSessionCookie && !isPublic) {
    // API clients need a machine-readable answer, not an HTML redirect.
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const loginUrl = new URL('/login', req.url)
    // Preserve where the user was heading so we can send them back after login.
    if (pathname !== '/') loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/mock-external-sync).*)'],
}
