'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  EmptyState,
  ErrorBanner,
  PageLoading,
  PriorityBadge,
  StageBadge,
  timeAgo,
} from '../../components/ui'

type Application = {
  id: string
  title: string
  stage: string
  priority: string
  assignedUser: { id: string; name: string } | null
  workItems: { id: string; status: string }[]
  updatedAt: string
}

type Customer = {
  id: string
  name: string
  email: string
  company: string
  phone: string | null
  createdAt: string
  applications: Application[]
}

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      const res = await fetch(`/api/customers/${id}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error || 'Could not load this customer.')
        setCustomer(null)
        return
      }
      setCustomer(await res.json())
    } catch {
      setError('Network error while loading the customer.')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  if (loading) return <PageLoading label="Loading customer..." />

  if (error || !customer) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-12">
        <ErrorBanner message={error || 'Customer not found.'} onRetry={load} />
        <Link href="/customers" className="text-sm text-indigo-600 hover:underline">
          &larr; Back to customers
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <Link href="/customers" className="text-sm text-indigo-600 hover:underline">
        &larr; Back to customers
      </Link>

      <section className="bg-white border border-gray-200 rounded-xl p-6 mt-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{customer.name}</h1>
        <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4 text-sm">
          <div>
            <dt className="text-gray-500 text-xs">Company</dt>
            <dd className="text-gray-900 mt-0.5">{customer.company}</dd>
          </div>
          <div>
            <dt className="text-gray-500 text-xs">Email</dt>
            <dd className="text-gray-900 mt-0.5 break-all">{customer.email}</dd>
          </div>
          <div>
            <dt className="text-gray-500 text-xs">Phone</dt>
            <dd className="text-gray-900 mt-0.5">{customer.phone ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-gray-500 text-xs">Customer since</dt>
            <dd className="text-gray-900 mt-0.5">
              {new Date(customer.createdAt).toLocaleDateString()}
            </dd>
          </div>
        </dl>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="text-lg font-semibold text-gray-900">
          Applications{' '}
          <span className="text-sm font-normal text-gray-500">({customer.applications.length})</span>
        </h2>
        <Link
          href={`/applications/new?customerId=${customer.id}`}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 transition"
        >
          New application
        </Link>
      </div>

      {customer.applications.length === 0 ? (
        <EmptyState
          title="No applications visible for this customer."
          hint="Either none exist yet, or they are assigned to another team."
        />
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th scope="col" className="text-left px-6 py-3 font-semibold text-gray-600">Title</th>
                  <th scope="col" className="text-left px-6 py-3 font-semibold text-gray-600">Stage</th>
                  <th scope="col" className="text-left px-6 py-3 font-semibold text-gray-600">Priority</th>
                  <th scope="col" className="text-left px-6 py-3 font-semibold text-gray-600">Owner</th>
                  <th scope="col" className="text-left px-6 py-3 font-semibold text-gray-600">Work</th>
                  <th scope="col" className="text-left px-6 py-3 font-semibold text-gray-600">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {customer.applications.map((app) => {
                  const done = app.workItems.filter((w) => w.status === 'COMPLETED').length
                  return (
                    <tr key={app.id} className="hover:bg-gray-50 transition">
                      <td className="px-6 py-4">
                        <Link
                          href={`/applications/${app.id}`}
                          className="text-indigo-600 hover:text-indigo-800 font-medium"
                        >
                          {app.title}
                        </Link>
                      </td>
                      <td className="px-6 py-4">
                        <StageBadge stage={app.stage} />
                      </td>
                      <td className="px-6 py-4">
                        <PriorityBadge priority={app.priority} />
                      </td>
                      <td className="px-6 py-4 text-gray-600">
                        {app.assignedUser?.name ?? (
                          <span className="text-amber-600">Unassigned</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-gray-500 text-xs">
                        {app.workItems.length === 0 ? '—' : `${done}/${app.workItems.length}`}
                      </td>
                      <td className="px-6 py-4 text-gray-500 text-xs">{timeAgo(app.updatedAt)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
