'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useSession } from '@/lib/useSession'
import {
  APPLICATION_PRIORITIES,
  WORK_ITEM_STATUSES,
  availableTransitions,
  canAssign,
  canEditPriority,
  stageLabel,
  type ApplicationStage,
  type Role,
} from '@/lib/workflow'
import {
  ErrorBanner,
  PageLoading,
  PriorityBadge,
  StageBadge,
  SyncBadge,
  WorkItemBadge,
  timeAgo,
} from '../../components/ui'

type Person = { id: string; name: string; role?: string; team?: { id: string; name: string } | null }

type WorkItem = {
  id: string
  title: string
  status: string
  assignedUser: Person | null
}

type ActivityLog = {
  id: string
  action: string
  details: string
  user: Person | null
  createdAt: string
}

type Application = {
  id: string
  title: string
  description: string
  priority: string
  stage: string
  version: number
  syncStatus: string
  syncAttempts: number
  lastSyncError: string | null
  lastSyncedAt: string | null
  customer: { id: string; name: string; company: string; email: string }
  assignedUserId: string | null
  assignedUser: Person | null
  workItems: WorkItem[]
  activityLogs: ActivityLog[]
  createdAt: string
  updatedAt: string
}

const ACTION_STYLES: Record<string, string> = {
  CREATED: 'border-emerald-400',
  STAGE_CHANGED: 'border-blue-400',
  REOPENED: 'border-red-400',
  ASSIGNED: 'border-amber-400',
  REASSIGNED: 'border-amber-400',
  UPDATED: 'border-gray-300',
  WORK_ITEM_CREATED: 'border-teal-400',
  WORK_ITEM_UPDATED: 'border-teal-400',
  WORK_ITEM_COMPLETED: 'border-teal-500',
  WORK_ITEM_ASSIGNED: 'border-teal-400',
  WORK_ITEM_REMOVED: 'border-gray-300',
  SYNC_SUCCEEDED: 'border-emerald-500',
  SYNC_FAILED: 'border-red-500',
}

export default function ApplicationDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user, loading: sessionLoading } = useSession()

  const [app, setApp] = useState<Application | null>(null)
  const [people, setPeople] = useState<Person[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [busy, setBusy] = useState(false)

  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', priority: '', assignedUserId: '' })

  const [newWorkItem, setNewWorkItem] = useState({ title: '', assignedUserId: '' })
  const [addingWorkItem, setAddingWorkItem] = useState(false)

  const load = useCallback(async () => {
    setLoadError('')
    try {
      const res = await fetch(`/api/applications/${id}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setLoadError(body.error || 'Could not load this application.')
        setApp(null)
        return
      }
      setApp(await res.json())
    } catch {
      setLoadError('Network error while loading the application.')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
    fetch('/api/users')
      .then((res) => (res.ok ? res.json() : []))
      .then(setPeople)
      .catch(() => setPeople([]))
  }, [load])

  /** Sends a PATCH, translating a 409 into a reload so nothing is silently lost. */
  const patch = async (payload: Record<string, unknown>) => {
    if (!app) return
    setBusy(true)
    setActionError('')

    try {
      const res = await fetch(`/api/applications/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, version: app.version }),
      })

      const body = await res.json().catch(() => ({}))

      if (!res.ok) {
        setActionError(body.error || 'The change could not be saved.')
        // On a concurrency clash, pull the winning version into view.
        if (res.status === 409) await load()
        return false
      }

      setApp(body)
      return true
    } catch {
      setActionError('Network error. Your change was not saved.')
      return false
    } finally {
      setBusy(false)
    }
  }

  const startEditing = () => {
    if (!app) return
    setForm({
      title: app.title,
      description: app.description,
      priority: app.priority,
      assignedUserId: app.assignedUserId ?? '',
    })
    setEditing(true)
  }

  const saveEdits = async () => {
    if (!app || !user) return
    const payload: Record<string, unknown> = {}

    if (form.title !== app.title) payload.title = form.title
    if (form.description !== app.description) payload.description = form.description
    if (canEditPriority(user.role) && form.priority !== app.priority) payload.priority = form.priority
    if (canAssign(user.role) && form.assignedUserId !== (app.assignedUserId ?? '')) {
      payload.assignedUserId = form.assignedUserId || null
    }

    if (Object.keys(payload).length === 0) {
      setEditing(false)
      return
    }

    if (await patch(payload)) setEditing(false)
  }

  const addWorkItem = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newWorkItem.title.trim()) return

    setBusy(true)
    setActionError('')

    try {
      const res = await fetch(`/api/applications/${id}/work-items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newWorkItem.title.trim(),
          assignedUserId: newWorkItem.assignedUserId || undefined,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setActionError(body.error || 'Could not add the work item.')
        return
      }

      setNewWorkItem({ title: '', assignedUserId: '' })
      setAddingWorkItem(false)
      await load()
    } finally {
      setBusy(false)
    }
  }

  const updateWorkItem = async (workItemId: string, payload: Record<string, unknown>) => {
    setBusy(true)
    setActionError('')

    try {
      const res = await fetch(`/api/work-items/${workItemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setActionError(body.error || 'Could not update the work item.')
        return
      }

      await load()
    } finally {
      setBusy(false)
    }
  }

  const retrySync = async () => {
    setBusy(true)
    setActionError('')

    try {
      const res = await fetch(`/api/applications/${id}/retry-sync`, { method: 'POST' })
      const body = await res.json().catch(() => ({}))

      if (!res.ok) {
        setActionError(body.error || 'Retry failed.')
        return
      }

      setApp(body)
    } finally {
      setBusy(false)
    }
  }

  if (sessionLoading || loading) return <PageLoading label="Loading application..." />
  if (!user) return null

  if (loadError || !app) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-12">
        <ErrorBanner message={loadError || 'Application not found.'} onRetry={load} />
        <Link href="/dashboard" className="text-sm text-indigo-600 hover:underline">
          &larr; Back to applications
        </Link>
      </div>
    )
  }

  const role = user.role as Role
  const isAssignee = app.assignedUserId === user.id
  const transitions = availableTransitions(app.stage as ApplicationStage, role, isAssignee)
  const completedWork = app.workItems.filter((w) => w.status === 'COMPLETED').length
  const openWork = app.workItems.length - completedWork

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <nav className="flex flex-wrap items-center gap-2 text-sm text-gray-500 mb-5">
        <Link href="/dashboard" className="hover:text-indigo-600">
          Applications
        </Link>
        <span aria-hidden>/</span>
        <Link href={`/customers/${app.customer.id}`} className="hover:text-indigo-600">
          {app.customer.name}
        </Link>
        <span aria-hidden>/</span>
        <span className="text-gray-900 font-medium">{app.title}</span>
      </nav>

      {actionError && <ErrorBanner message={actionError} onDismiss={() => setActionError('')} />}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ---------------- main column ---------------- */}
        <div className="lg:col-span-2 space-y-5">
          <section className="bg-white border border-gray-200 rounded-xl p-6">
            {editing ? (
              <div className="space-y-4">
                <h2 className="font-semibold text-gray-900">Edit details</h2>

                <label className="block">
                  <span className="block text-sm font-medium text-gray-700 mb-1">Title</span>
                  <input
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </label>

                <label className="block">
                  <span className="block text-sm font-medium text-gray-700 mb-1">Description</span>
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {canEditPriority(role) && (
                    <label className="block">
                      <span className="block text-sm font-medium text-gray-700 mb-1">Priority</span>
                      <select
                        value={form.priority}
                        onChange={(e) => setForm({ ...form, priority: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        {APPLICATION_PRIORITIES.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}

                  {canAssign(role) && (
                    <label className="block">
                      <span className="block text-sm font-medium text-gray-700 mb-1">
                        Responsible user
                      </span>
                      <select
                        value={form.assignedUserId}
                        onChange={(e) => setForm({ ...form, assignedUserId: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="">Unassigned</option>
                        {people.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} {p.role ? `(${p.role})` : ''}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>

                <div className="flex items-center gap-3 pt-1">
                  <button
                    onClick={saveEdits}
                    disabled={busy}
                    className="bg-indigo-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {busy ? 'Saving...' : 'Save changes'}
                  </button>
                  <button
                    onClick={() => setEditing(false)}
                    className="text-sm text-gray-600 hover:text-gray-900 font-medium"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h1 className="text-xl font-bold text-gray-900">{app.title}</h1>
                    <p className="text-gray-600 mt-2 whitespace-pre-line">{app.description}</p>
                  </div>
                  <button
                    onClick={startEditing}
                    className="text-sm font-medium text-indigo-600 hover:text-indigo-800 border border-indigo-200 rounded-lg px-3 py-1.5 shrink-0"
                  >
                    Edit
                  </button>
                </div>

                <dl className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-5 text-sm">
                  <div className="flex items-center gap-2">
                    <dt className="text-gray-500">Stage</dt>
                    <dd>
                      <StageBadge stage={app.stage} />
                    </dd>
                  </div>
                  <div className="flex items-center gap-2">
                    <dt className="text-gray-500">Priority</dt>
                    <dd>
                      <PriorityBadge priority={app.priority} />
                    </dd>
                  </div>
                  <div className="flex items-center gap-2">
                    <dt className="text-gray-500">Owner</dt>
                    <dd className="font-medium text-gray-800">
                      {app.assignedUser?.name ?? <span className="text-amber-600">Unassigned</span>}
                    </dd>
                  </div>
                  <div className="flex items-center gap-2">
                    <dt className="text-gray-500">Revision</dt>
                    <dd className="font-mono text-xs text-gray-600">v{app.version}</dd>
                  </div>
                </dl>

                <p className="text-xs text-gray-400 mt-4">
                  Created {new Date(app.createdAt).toLocaleString()} · Updated {timeAgo(app.updatedAt)}
                </p>
              </>
            )}
          </section>

          {/* Workflow */}
          <section className="bg-white border border-gray-200 rounded-xl p-6">
            <h2 className="font-semibold text-gray-900 mb-1">Workflow</h2>
            <p className="text-xs text-gray-500 mb-4">
              Currently in <span className="font-medium text-gray-700">{stageLabel(app.stage)}</span>.
              {openWork > 0 && app.stage !== 'COMPLETED' && (
                <> {openWork} work item{openWork === 1 ? '' : 's'} still open.</>
              )}
            </p>

            {transitions.length === 0 ? (
              <p className="text-sm text-gray-500">
                {app.stage === 'COMPLETED'
                  ? 'This application is complete. Only an administrator can reopen it.'
                  : 'You do not have permission to change the stage of this application.'}
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {transitions.map((next) => {
                  const reopening = app.stage === 'COMPLETED'
                  const completing = next === 'COMPLETED'
                  return (
                    <button
                      key={next}
                      onClick={() => patch({ stage: next })}
                      disabled={busy}
                      className={`text-sm font-medium px-4 py-2 rounded-lg text-white disabled:opacity-50 transition ${
                        reopening
                          ? 'bg-red-600 hover:bg-red-700'
                          : completing
                            ? 'bg-emerald-600 hover:bg-emerald-700'
                            : 'bg-indigo-600 hover:bg-indigo-700'
                      }`}
                    >
                      {reopening ? 'Reopen application' : `Move to ${stageLabel(next)}`}
                    </button>
                  )
                })}
              </div>
            )}
          </section>

          {/* External sync */}
          {app.stage === 'COMPLETED' && (
            <section className="bg-white border border-gray-200 rounded-xl p-6">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <h2 className="font-semibold text-gray-900">External system</h2>
                <SyncBadge status={app.syncStatus} />
              </div>

              <p className="text-xs text-gray-500 mb-3">
                {app.syncAttempts} attempt{app.syncAttempts === 1 ? '' : 's'}
                {app.lastSyncedAt && ` · last succeeded ${timeAgo(app.lastSyncedAt)}`}
              </p>

              {app.syncStatus === 'SUCCESS' && (
                <p className="text-sm text-emerald-700">
                  This application has been recorded in the external system.
                </p>
              )}

              {app.syncStatus !== 'SUCCESS' && (
                <div className="space-y-3">
                  {app.lastSyncError && (
                    <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
                      {app.lastSyncError}
                    </p>
                  )}
                  <p className="text-xs text-gray-500">
                    The application is completed regardless of this failure. Retrying reuses the
                    original request key, so the external system will not create a duplicate.
                  </p>
                  <button
                    onClick={retrySync}
                    disabled={busy}
                    className="bg-amber-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-amber-700 disabled:opacity-50"
                  >
                    {busy ? 'Retrying...' : 'Retry synchronisation'}
                  </button>
                </div>
              )}
            </section>
          )}
        </div>

        {/* ---------------- sidebar ---------------- */}
        <div className="space-y-5">
          <section className="bg-white border border-gray-200 rounded-xl p-5">
            <h2 className="font-semibold text-gray-900 mb-1">Customer</h2>
            <Link
              href={`/customers/${app.customer.id}`}
              className="text-sm text-indigo-600 hover:underline font-medium"
            >
              {app.customer.name}
            </Link>
            <p className="text-xs text-gray-500 mt-1">{app.customer.company}</p>
            <p className="text-xs text-gray-500">{app.customer.email}</p>
          </section>

          {/* Work items */}
          <section className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-900">
                Work items{' '}
                <span className="text-xs font-normal text-gray-500">
                  ({completedWork}/{app.workItems.length})
                </span>
              </h2>
              {app.stage !== 'COMPLETED' && (
                <button
                  onClick={() => setAddingWorkItem(!addingWorkItem)}
                  className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
                >
                  {addingWorkItem ? 'Cancel' : 'Add'}
                </button>
              )}
            </div>

            {addingWorkItem && (
              <form onSubmit={addWorkItem} className="space-y-2 mb-4">
                <input
                  value={newWorkItem.title}
                  onChange={(e) => setNewWorkItem({ ...newWorkItem, title: e.target.value })}
                  placeholder="What needs doing?"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <select
                  value={newWorkItem.assignedUserId}
                  onChange={(e) => setNewWorkItem({ ...newWorkItem, assignedUserId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Unassigned</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full bg-indigo-600 text-white py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
                >
                  Add work item
                </button>
              </form>
            )}

            {app.workItems.length === 0 ? (
              <p className="text-xs text-gray-500">No work items yet.</p>
            ) : (
              <ul className="space-y-3">
                {app.workItems.map((item) => (
                  <li key={item.id} className="border-b border-gray-100 last:border-0 pb-3 last:pb-0">
                    <p
                      className={`text-sm ${
                        item.status === 'COMPLETED' ? 'line-through text-gray-400' : 'text-gray-800'
                      }`}
                    >
                      {item.title}
                    </p>
                    <div className="flex items-center justify-between gap-2 mt-1.5">
                      <span className="text-[11px] text-gray-500">
                        {item.assignedUser?.name ?? 'Unassigned'}
                      </span>
                      {app.stage === 'COMPLETED' ? (
                        <WorkItemBadge status={item.status} />
                      ) : (
                        <select
                          value={item.status}
                          onChange={(e) => updateWorkItem(item.id, { status: e.target.value })}
                          disabled={busy}
                          aria-label={`Status for ${item.title}`}
                          className="text-[11px] border border-gray-300 rounded px-1.5 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          {WORK_ITEM_STATUSES.map((status) => (
                            <option key={status} value={status}>
                              {status.replace(/_/g, ' ').toLowerCase()}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Activity */}
          <section className="bg-white border border-gray-200 rounded-xl p-5">
            <h2 className="font-semibold text-gray-900 mb-3">Activity history</h2>
            {app.activityLogs.length === 0 ? (
              <p className="text-xs text-gray-500">Nothing recorded yet.</p>
            ) : (
              <ol className="space-y-3 max-h-96 overflow-y-auto pr-1">
                {app.activityLogs.map((log) => (
                  <li
                    key={log.id}
                    className={`border-l-2 pl-3 ${ACTION_STYLES[log.action] ?? 'border-gray-300'}`}
                  >
                    <p className="text-xs font-semibold text-gray-800">
                      {log.action.replace(/_/g, ' ')}
                    </p>
                    <p className="text-xs text-gray-600">{log.details}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {log.user?.name ?? 'System'} · {timeAgo(log.createdAt)}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
