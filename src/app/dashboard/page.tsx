'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useSession } from '@/lib/useSession'
import { APPLICATION_PRIORITIES, APPLICATION_STAGES, stageLabel } from '@/lib/workflow'
import {
  EmptyState,
  ErrorBanner,
  PageLoading,
  Pagination,
  PriorityBadge,
  StageBadge,
  timeAgo,
} from '../components/ui'

type Application = {
  id: string
  title: string
  description: string
  priority: string
  stage: string
  version: number
  syncStatus: string
  customer: { id: string; name: string; company: string }
  assignedUser: { id: string; name: string } | null
  workItems: { id: string; status: string }[]
  updatedAt: string
}

const PAGE_SIZE = 10

export default function DashboardPage() {
  const { user, loading: sessionLoading } = useSession()

  const [applications, setApplications] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [stage, setStage] = useState('')
  const [priority, setPriority] = useState('')
  const [mineOnly, setMineOnly] = useState(false)

  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)

  // Debounce typing so we do not fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(timer)
  }, [search])

  // Any filter change invalidates the current page number.
  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, stage, priority, mineOnly])

  const load = useCallback(async () => {
    if (!user) return

    setLoading(true)
    setError('')

    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) })
    if (debouncedSearch) params.set('search', debouncedSearch)
    if (stage) params.set('stage', stage)
    if (priority) params.set('priority', priority)
    if (mineOnly) params.set('assignedUserId', user.id)

    try {
      const res = await fetch(`/api/applications?${params}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error || 'Could not load applications.')
        return
      }

      const body = await res.json()
      setApplications(body.data)
      setTotal(body.total)
      setTotalPages(body.totalPages)
    } catch {
      setError('Network error while loading applications.')
    } finally {
      setLoading(false)
    }
  }, [user, page, debouncedSearch, stage, priority, mineOnly])

  useEffect(() => {
    load()
  }, [load])

  if (sessionLoading) return <PageLoading label="Loading your workspace..." />
  if (!user) return null

  const scopeHint =
    user.role === 'ADMIN'
      ? 'You can see every application in the system.'
      : user.role === 'MANAGER'
        ? `Showing applications handled by the ${user.team?.name ?? 'your'} team, plus anything unassigned.`
        : 'Showing applications assigned to you.'

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Applications</h1>
          <p className="text-sm text-gray-500 mt-1">{scopeHint}</p>
        </div>
        <Link
          href="/applications/new"
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 transition"
        >
          New application
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6 space-y-3">
        <div className="flex flex-wrap gap-3">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, description, customer or company..."
            aria-label="Search applications"
            className="flex-1 min-w-[16rem] px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            onClick={() => setMineOnly(!mineOnly)}
            aria-pressed={mineOnly}
            className={`px-3 py-2 rounded-lg text-xs font-semibold border transition ${
              mineOnly
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
            }`}
          >
            Assigned to me
          </button>
        </div>

        <FilterRow
          label="Stage"
          options={APPLICATION_STAGES.map((s) => ({ value: s, label: stageLabel(s) }))}
          value={stage}
          onChange={setStage}
        />
        <FilterRow
          label="Priority"
          options={APPLICATION_PRIORITIES.map((p) => ({ value: p, label: p }))}
          value={priority}
          onChange={setPriority}
        />
      </div>

      {error && <ErrorBanner message={error} onRetry={load} onDismiss={() => setError('')} />}

      {loading ? (
        <PageLoading label="Loading applications..." />
      ) : applications.length === 0 ? (
        <EmptyState
          title="No applications match these filters."
          hint="Try clearing the search or selecting a different stage."
        />
      ) : (
        <div className="space-y-3">
          {applications.map((app) => {
            const done = app.workItems.filter((w) => w.status === 'COMPLETED').length
            return (
              <Link
                key={app.id}
                href={`/applications/${app.id}`}
                className="block bg-white p-5 rounded-xl border border-gray-200 hover:border-indigo-300 hover:shadow-sm transition"
              >
                <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
                  <h2 className="font-semibold text-gray-900">{app.title}</h2>
                  <div className="flex items-center gap-2">
                    <PriorityBadge priority={app.priority} />
                    <StageBadge stage={app.stage} />
                  </div>
                </div>

                <p className="text-sm text-gray-600 mb-3 line-clamp-2">{app.description}</p>

                <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-gray-500">
                  <span>
                    {app.customer.name}{' '}
                    <span className="text-gray-400">({app.customer.company})</span>
                  </span>
                  <span>
                    Owner:{' '}
                    <span className={app.assignedUser ? 'text-gray-700 font-medium' : 'text-amber-600 font-medium'}>
                      {app.assignedUser?.name ?? 'Unassigned'}
                    </span>
                  </span>
                  {app.workItems.length > 0 && (
                    <span>
                      Work: {done}/{app.workItems.length} done
                    </span>
                  )}
                  {app.stage === 'COMPLETED' && app.syncStatus === 'FAILED' && (
                    <span className="text-red-600 font-medium">Sync failed</span>
                  )}
                  <span className="ml-auto text-gray-400">Updated {timeAgo(app.updatedAt)}</span>
                </div>
              </Link>
            )
          })}
        </div>
      )}

      <Pagination page={page} totalPages={totalPages} total={total} onChange={setPage} />
    </div>
  )
}

function FilterRow({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: { value: string; label: string }[]
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-gray-500 w-14">{label}</span>
      {[{ value: '', label: 'All' }, ...options].map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          className={`px-3 py-1 rounded-full text-xs font-medium border transition ${
            value === option.value
              ? 'bg-gray-900 text-white border-gray-900'
              : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
