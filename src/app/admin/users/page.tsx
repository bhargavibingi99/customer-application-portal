'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from '@/lib/useSession'
import { USER_ROLES } from '@/lib/workflow'
import { EmptyState, ErrorBanner, PageLoading, RoleBadge } from '../../components/ui'

type Team = { id: string; name: string; _count: { members: number } }

type ManagedUser = {
  id: string
  name: string
  email: string
  role: string
  createdAt: string
  team: { id: string; name: string } | null
  _count: { applications: number }
}

const emptyForm = { name: '', email: '', role: 'EXECUTIVE', teamId: '' }

/**
 * Administrator-only user directory.
 *
 * Access is enforced by the API; this page additionally redirects non-admins so
 * they never see a screen they cannot use.
 */
export default function AdminUsersPage() {
  const router = useRouter()
  const { user, loading: sessionLoading } = useSession()

  const [users, setUsers] = useState<ManagedUser[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!sessionLoading && user && user.role !== 'ADMIN') router.replace('/dashboard')
  }, [sessionLoading, user, router])

  const load = useCallback(async () => {
    setError('')
    try {
      const [userRes, teamRes] = await Promise.all([fetch('/api/users'), fetch('/api/teams')])

      if (!userRes.ok) {
        const body = await userRes.json().catch(() => ({}))
        setError(body.error || 'Could not load users.')
        return
      }

      setUsers(await userRes.json())
      setTeams(teamRes.ok ? await teamRes.json() : [])
    } catch {
      setError('Network error while loading users.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (user?.role === 'ADMIN') load()
  }, [user, load])

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    setSubmitting(true)

    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, teamId: form.teamId || null }),
      })

      const body = await res.json().catch(() => ({}))

      if (!res.ok) {
        setFormError(body.error || 'Could not create the user.')
        return
      }

      setForm(emptyForm)
      setShowForm(false)
      await load()
    } catch {
      setFormError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (sessionLoading || loading) return <PageLoading label="Loading users..." />
  if (!user || user.role !== 'ADMIN') return null

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Users</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage who can access the portal and which team they belong to.
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 transition"
        >
          {showForm ? 'Cancel' : 'New user'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={create} className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Create user</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Full name"
              required
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="Email address"
              required
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              aria-label="Role"
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {USER_ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
            <select
              value={form.teamId}
              onChange={(e) => setForm({ ...form, teamId: e.target.value })}
              aria-label="Team"
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">No team</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </div>

          <p className="text-xs text-gray-500 mt-3">
            This demo signs in with an email address only, so no password is required.
          </p>

          {formError && <p className="text-sm text-red-600 mt-3">{formError}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="mt-4 bg-indigo-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
          >
            {submitting ? 'Creating...' : 'Create user'}
          </button>
        </form>
      )}

      {error && <ErrorBanner message={error} onRetry={load} onDismiss={() => setError('')} />}

      {users.length === 0 ? (
        <EmptyState title="No users found." />
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th scope="col" className="text-left px-6 py-3 font-semibold text-gray-600">Name</th>
                  <th scope="col" className="text-left px-6 py-3 font-semibold text-gray-600">Email</th>
                  <th scope="col" className="text-left px-6 py-3 font-semibold text-gray-600">Role</th>
                  <th scope="col" className="text-left px-6 py-3 font-semibold text-gray-600">Team</th>
                  <th scope="col" className="text-center px-6 py-3 font-semibold text-gray-600">Applications</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map((managed) => (
                  <tr key={managed.id} className="hover:bg-gray-50 transition">
                    <td className="px-6 py-4 font-medium text-gray-900">
                      {managed.name}
                      {managed.id === user.id && (
                        <span className="text-xs text-gray-400 ml-2">(you)</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-gray-600 break-all">{managed.email}</td>
                    <td className="px-6 py-4">
                      <RoleBadge role={managed.role} />
                    </td>
                    <td className="px-6 py-4 text-gray-600">{managed.team?.name ?? '—'}</td>
                    <td className="px-6 py-4 text-center text-gray-600">
                      {managed._count.applications}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
