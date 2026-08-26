'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export type SessionUser = {
  id: string
  name: string
  email: string
  role: 'ADMIN' | 'MANAGER' | 'EXECUTIVE'
  team: { id: string; name: string } | null
}

/**
 * Loads the signed-in user for client pages.
 *
 * If the session is missing or stale the user is sent to /login rather than
 * being left on a page that silently fails every request.
 */
export function useSession() {
  const router = useRouter()
  const [user, setUser] = useState<SessionUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const res = await fetch('/api/auth/me')

        if (cancelled) return

        if (!res.ok) {
          router.replace('/login')
          return
        }

        setUser(await res.json())
      } catch {
        if (!cancelled) router.replace('/login')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [router])

  return { user, loading }
}

export const canManageWorkflow = (role?: string) => role === 'ADMIN' || role === 'MANAGER'
export const isAdmin = (role?: string) => role === 'ADMIN'
