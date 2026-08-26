'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

const DEMO_USERS = [
  { name: 'Alice Admin', email: 'admin@system.com', role: 'ADMIN' },
  { name: 'Bob Manager', email: 'manager@system.com', role: 'MANAGER' },
  { name: 'Charlie Exec', email: 'exec@system.com', role: 'EXECUTIVE' },
  { name: 'Dana Exec', email: 'dana@system.com', role: 'EXECUTIVE' },
]

const roleBadge: Record<string, string> = {
  ADMIN: 'bg-red-100 text-red-700',
  MANAGER: 'bg-blue-100 text-blue-700',
  EXECUTIVE: 'bg-green-100 text-green-700',
}

/**
 * useSearchParams() opts a route into client-side rendering, so the form is
 * isolated behind a Suspense boundary to keep the shell prerenderable.
 */
export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <p className="text-sm text-gray-500">Loading...</p>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  )
}

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const nextPath = searchParams.get('next') || '/dashboard'

  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)

  /**
   * Self-healing session check.
   *
   * The middleware can only see that a cookie exists, not that it is valid.
   * If the database was re-seeded, the browser can hold a cookie pointing at a
   * user id that no longer exists. Without this check the user would be stuck:
   * every page would treat them as "logged in" while every API call returned 401.
   * Here we verify the session and discard it if it is stale.
   */
  useEffect(() => {
    let cancelled = false

    const verifySession = async () => {
      try {
        const res = await fetch('/api/auth/me')

        if (cancelled) return

        if (res.ok) {
          router.replace(nextPath)
          return
        }

        // Cookie is missing or stale. Clear it so the app starts from a clean slate.
        await fetch('/api/auth/logout', { method: 'POST' })
      } catch {
        // Offline or unexpected failure: just show the form.
      } finally {
        if (!cancelled) setCheckingSession(false)
      }
    }

    verifySession()
    return () => {
      cancelled = true
    }
  }, [router, nextPath])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setError(data.error || 'Login failed. Please try again.')
        setLoading(false)
        return
      }

      // Full navigation so server components re-render with the new session.
      router.replace(nextPath)
      router.refresh()
    } catch {
      setError('Network error. Please check your connection and try again.')
      setLoading(false)
    }
  }

  if (checkingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-sm text-gray-500">Checking session...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-gray-900">Customer Application Portal</h1>
            <p className="text-sm text-gray-500 mt-1">Sign in to manage applications</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
                autoComplete="email"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {error && (
              <div
                role="alert"
                className="bg-red-50 text-red-700 text-sm px-4 py-2.5 rounded-lg border border-red-200"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <div className="mt-8 border-t border-gray-100 pt-6">
            <p className="text-xs text-gray-500 text-center mb-3">
              Demo accounts (click to fill, then press Sign in)
            </p>
            <div className="space-y-2">
              {DEMO_USERS.map((user) => (
                <button
                  key={user.email}
                  type="button"
                  onClick={() => setEmail(user.email)}
                  className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 hover:bg-gray-100 rounded-lg border border-gray-200 transition text-left"
                >
                  <span className="min-w-0">
                    <span className="text-sm font-medium text-gray-800">{user.name}</span>
                    <span className="text-xs text-gray-500 ml-2">{user.email}</span>
                  </span>
                  <span
                    className={`text-xs font-semibold px-2 py-0.5 rounded shrink-0 ${roleBadge[user.role]}`}
                  >
                    {user.role}
                  </span>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-gray-400 text-center mt-4">
              Demo build: authentication is email-only, no password required.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
