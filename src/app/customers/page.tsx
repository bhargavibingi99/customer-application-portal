'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { EmptyState, ErrorBanner, PageLoading, Pagination } from '../components/ui'

type Customer = {
  id: string
  name: string
  email: string
  company: string
  phone: string | null
  createdAt: string
  _count: { applications: number }
}

const PAGE_SIZE = 10
const emptyForm = { name: '', email: '', company: '', phone: '' }

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    setPage(1)
  }, [debouncedSearch])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')

    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) })
    if (debouncedSearch) params.set('search', debouncedSearch)

    try {
      const res = await fetch(`/api/customers?${params}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error || 'Could not load customers.')
        return
      }

      const body = await res.json()
      setCustomers(body.data)
      setTotal(body.total)
      setTotalPages(body.totalPages)
    } catch {
      setError('Network error while loading customers.')
    } finally {
      setLoading(false)
    }
  }, [page, debouncedSearch])

  useEffect(() => {
    load()
  }, [load])

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    setSubmitting(true)

    try {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })

      const body = await res.json().catch(() => ({}))

      if (!res.ok) {
        setFormError(body.error || 'Could not create the customer.')
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

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Customers</h1>
          <p className="text-sm text-gray-500 mt-1">
            {total} customer{total === 1 ? '' : 's'} on record
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 transition"
        >
          {showForm ? 'Cancel' : 'New customer'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={create} className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Create customer</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Contact name"
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
            <input
              value={form.company}
              onChange={(e) => setForm({ ...form, company: e.target.value })}
              placeholder="Company"
              required
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="Phone (optional)"
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {formError && <p className="text-sm text-red-600 mt-3">{formError}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="mt-4 bg-indigo-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
          >
            {submitting ? 'Creating...' : 'Create customer'}
          </button>
        </form>
      )}

      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by name, email or company..."
        aria-label="Search customers"
        className="w-full max-w-md px-4 py-2 border border-gray-300 rounded-lg text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />

      {error && <ErrorBanner message={error} onRetry={load} onDismiss={() => setError('')} />}

      {loading ? (
        <PageLoading label="Loading customers..." />
      ) : customers.length === 0 ? (
        <EmptyState
          title={search ? 'No customers match your search.' : 'No customers yet.'}
          hint={search ? undefined : 'Create your first customer to start raising applications.'}
        />
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th scope="col" className="text-left px-6 py-3 font-semibold text-gray-600">Name</th>
                  <th scope="col" className="text-left px-6 py-3 font-semibold text-gray-600">Company</th>
                  <th scope="col" className="text-left px-6 py-3 font-semibold text-gray-600">Contact</th>
                  <th scope="col" className="text-center px-6 py-3 font-semibold text-gray-600">Applications</th>
                  <th scope="col" className="text-right px-6 py-3 font-semibold text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {customers.map((customer) => (
                  <tr key={customer.id} className="hover:bg-gray-50 transition">
                    <td className="px-6 py-4 font-medium text-gray-900">{customer.name}</td>
                    <td className="px-6 py-4 text-gray-600">{customer.company}</td>
                    <td className="px-6 py-4 text-gray-600">
                      <span className="block">{customer.email}</span>
                      {customer.phone && (
                        <span className="block text-xs text-gray-400">{customer.phone}</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full text-xs font-semibold">
                        {customer._count.applications}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link
                        href={`/customers/${customer.id}`}
                        className="text-indigo-600 hover:text-indigo-800 font-medium"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Pagination page={page} totalPages={totalPages} total={total} onChange={setPage} />
    </div>
  )
}
