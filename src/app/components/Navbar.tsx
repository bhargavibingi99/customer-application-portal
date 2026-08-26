'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { RoleBadge } from './ui'
import type { SessionUser } from '@/lib/useSession'

/**
 * Top navigation. Renders nothing on the login screen or while unauthenticated,
 * so the login page stays uncluttered.
 */
export default function Navbar() {
  const router = useRouter()
  const pathname = usePathname()
  const [user, setUser] = useState<SessionUser | null>(null)
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => {
    if (pathname === '/login') {
      setUser(null)
      return
    }

    let cancelled = false
    fetch('/api/auth/me')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled) setUser(data)
      })
      .catch(() => {
        if (!cancelled) setUser(null)
      })

    return () => {
      cancelled = true
    }
  }, [pathname])

  const handleSignOut = async () => {
    setSigningOut(true)
    await fetch('/api/auth/logout', { method: 'POST' })
    setUser(null)
    router.replace('/login')
    router.refresh()
  }

  if (!user || pathname === '/login') return null

  const links = [
    { href: '/dashboard', label: 'Applications' },
    { href: '/customers', label: 'Customers' },
    // User administration is only meaningful for an administrator.
    ...(user.role === 'ADMIN' ? [{ href: '/admin/users', label: 'Users' }] : []),
  ]

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-6 min-w-0">
          <Link href="/dashboard" className="font-bold text-gray-900 shrink-0">
            Application Portal
          </Link>
          <div className="flex items-center gap-1">
            {links.map((link) => {
              const active = pathname === link.href || pathname.startsWith(`${link.href}/`)
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? 'page' : undefined}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${
                    active
                      ? 'bg-indigo-50 text-indigo-700'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  {link.label}
                </Link>
              )
            })}
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-medium text-gray-800 leading-tight">{user.name}</p>
            <p className="text-xs text-gray-500 leading-tight">{user.team?.name ?? 'No team'}</p>
          </div>
          <RoleBadge role={user.role} />
          <button
            onClick={handleSignOut}
            disabled={signingOut}
            className="text-sm text-gray-500 hover:text-gray-800 font-medium disabled:opacity-50"
          >
            {signingOut ? 'Signing out...' : 'Sign out'}
          </button>
        </div>
      </div>
    </nav>
  )
}
