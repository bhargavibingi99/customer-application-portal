'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useSession } from '@/lib/useSession'
import { APPLICATION_PRIORITIES, canAssign } from '@/lib/workflow'
import { ErrorBanner, PageLoading } from '../../components/ui'

type Customer = { id: string; name: string; company: string }
type Person = { id: string; name: string; role: string }

/**
 * The customer can be preselected via ?customerId=, which requires
 * useSearchParams() and therefore a Suspense boundary.
 */
export default function NewApplicationPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <NewApplicationForm />
    </Suspense>
  )
}

function NewApplicationForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading: sessionLoading } = useSession()

  const [customers, setCustomers] = useState<Customer[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    title: '',
    description: '',
    priority: 'MEDIUM',
    customerId: searchParams.get('customerId') ?? '',
    assignedUserId: '',
  })

  useEffect(() => {
    Promise.all([
      // pageSize is raised so the picker lists every customer, not just page one.
      fetch('/api/customers?pageSize=50').then((r) => (r.ok ? r.json() : { data: [] })),
      fetch('/api/users').then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([customerPage, userList]) => {
        setCustomers(customerPage.data ?? [])
        setPeople(userList)
      })
      .catch(() => setError('Could not load customers and users.'))
      .finally(() => setLoading(false))
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)

    try {
      const res = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          assignedUserId: form.assignedUserId || undefined,
        }),
      })

      const body = await res.json().catch(() => ({}))

      if (!res.ok) {
        setError(body.error || 'Could not create the application.')
        setSubmitting(false)
        return
      }

      router.push(`/applications/${body.id}`)
    } catch {
      setError('Network error. Please try again.')
      setSubmitting(false)
    }
  }

  if (sessionLoading || loading) return <PageLoading />
  if (!user) return null

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <Link href="/dashboard" className="text-sm text-indigo-600 hover:underline">
        &larr; Back to applications
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 mt-4 mb-6">New application</h1>

      {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}

      <form onSubmit={submit} className="bg-white border border-gray-200 rounded-xl p-6 space-y-5">
        <label className="block">
          <span className="block text-sm font-medium text-gray-700 mb-1">Title</span>
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            required
            placeholder="What is this application for?"
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </label>

        <label className="block">
          <span className="block text-sm font-medium text-gray-700 mb-1">Description</span>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            required
            rows={4}
            placeholder="Background and what needs to happen"
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <label className="block">
            <span className="block text-sm font-medium text-gray-700 mb-1">Customer</span>
            <select
              value={form.customerId}
              onChange={(e) => setForm({ ...form, customerId: e.target.value })}
              required
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Select a customer</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.company})
                </option>
              ))}
            </select>
            {customers.length === 0 && (
              <span className="text-xs text-amber-600 mt-1 block">
                No customers yet.{' '}
                <Link href="/customers" className="underline">
                  Create one first
                </Link>
                .
              </span>
            )}
          </label>

          <label className="block">
            <span className="block text-sm font-medium text-gray-700 mb-1">Priority</span>
            <select
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: e.target.value })}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {APPLICATION_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
        </div>

        {canAssign(user.role) ? (
          <label className="block">
            <span className="block text-sm font-medium text-gray-700 mb-1">
              Assign to <span className="text-gray-400 font-normal">(optional)</span>
            </span>
            <select
              value={form.assignedUserId}
              onChange={(e) => setForm({ ...form, assignedUserId: e.target.value })}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Leave unassigned for triage</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.role})
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
            This application will be created unassigned. A manager will assign an owner.
          </p>
        )}

        <div className="flex items-center gap-4 pt-1">
          <button
            type="submit"
            disabled={submitting}
            className="bg-indigo-600 text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
          >
            {submitting ? 'Creating...' : 'Create application'}
          </button>
          <Link href="/dashboard" className="text-sm text-gray-600 hover:text-gray-900 font-medium">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}
