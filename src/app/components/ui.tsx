'use client'

import { stageLabel } from '@/lib/workflow'

/** Presentation helpers shared across screens. */

const STAGE_STYLES: Record<string, string> = {
  NEW: 'bg-slate-100 text-slate-700 border-slate-200',
  WAITING_FOR_INFO: 'bg-amber-100 text-amber-800 border-amber-200',
  IN_PROGRESS: 'bg-blue-100 text-blue-700 border-blue-200',
  UNDER_REVIEW: 'bg-purple-100 text-purple-700 border-purple-200',
  COMPLETED: 'bg-emerald-100 text-emerald-700 border-emerald-200',
}

const PRIORITY_STYLES: Record<string, string> = {
  LOW: 'bg-slate-100 text-slate-600 border-slate-200',
  MEDIUM: 'bg-sky-100 text-sky-700 border-sky-200',
  HIGH: 'bg-orange-100 text-orange-700 border-orange-200',
  CRITICAL: 'bg-red-100 text-red-700 border-red-200',
}

const ROLE_STYLES: Record<string, string> = {
  ADMIN: 'bg-red-100 text-red-700 border-red-200',
  MANAGER: 'bg-blue-100 text-blue-700 border-blue-200',
  EXECUTIVE: 'bg-emerald-100 text-emerald-700 border-emerald-200',
}

const SYNC_STYLES: Record<string, string> = {
  NOT_REQUIRED: 'bg-slate-100 text-slate-600 border-slate-200',
  PENDING: 'bg-amber-100 text-amber-800 border-amber-200',
  SUCCESS: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  FAILED: 'bg-red-100 text-red-700 border-red-200',
}

const WORK_ITEM_STYLES: Record<string, string> = {
  PENDING: 'bg-slate-100 text-slate-600 border-slate-200',
  IN_PROGRESS: 'bg-blue-100 text-blue-700 border-blue-200',
  COMPLETED: 'bg-emerald-100 text-emerald-700 border-emerald-200',
}

const base = 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border whitespace-nowrap'

export const StageBadge = ({ stage }: { stage: string }) => (
  <span className={`${base} ${STAGE_STYLES[stage] ?? STAGE_STYLES.NEW}`}>{stageLabel(stage)}</span>
)

export const PriorityBadge = ({ priority }: { priority: string }) => (
  <span className={`${base} ${PRIORITY_STYLES[priority] ?? PRIORITY_STYLES.MEDIUM}`}>{priority}</span>
)

export const RoleBadge = ({ role }: { role: string }) => (
  <span className={`${base} ${ROLE_STYLES[role] ?? ROLE_STYLES.EXECUTIVE}`}>{role}</span>
)

export const SyncBadge = ({ status }: { status: string }) => (
  <span className={`${base} ${SYNC_STYLES[status] ?? SYNC_STYLES.PENDING}`}>
    {status.replace(/_/g, ' ')}
  </span>
)

export const WorkItemBadge = ({ status }: { status: string }) => (
  <span className={`${base} ${WORK_ITEM_STYLES[status] ?? WORK_ITEM_STYLES.PENDING}`}>
    {status.replace(/_/g, ' ').toLowerCase()}
  </span>
)

/** Full-page loading placeholder. */
export const PageLoading = ({ label = 'Loading...' }: { label?: string }) => (
  <div className="max-w-7xl mx-auto px-6 py-16 text-center">
    <p className="text-sm text-gray-500">{label}</p>
  </div>
)

/** Inline error banner with an optional retry action. */
export const ErrorBanner = ({
  message,
  onDismiss,
  onRetry,
}: {
  message: string
  onDismiss?: () => void
  onRetry?: () => void
}) => (
  <div
    role="alert"
    className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-4 flex items-start justify-between gap-4"
  >
    <span>{message}</span>
    <span className="flex items-center gap-3 shrink-0">
      {onRetry && (
        <button onClick={onRetry} className="font-semibold underline hover:no-underline">
          Retry
        </button>
      )}
      {onDismiss && (
        <button onClick={onDismiss} aria-label="Dismiss error" className="font-bold text-red-500 hover:text-red-700">
          &times;
        </button>
      )}
    </span>
  </div>
)

/** Empty-state message for lists. */
export const EmptyState = ({ title, hint }: { title: string; hint?: string }) => (
  <div className="text-center py-12 bg-white border border-gray-200 rounded-xl">
    <p className="text-sm font-medium text-gray-700">{title}</p>
    {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
  </div>
)

/** Relative timestamp, e.g. "3h ago". */
export function timeAgo(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)

  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return date.toLocaleDateString()
}

/** Shared pagination control. */
export const Pagination = ({
  page,
  totalPages,
  total,
  onChange,
}: {
  page: number
  totalPages: number
  total: number
  onChange: (page: number) => void
}) => {
  if (totalPages <= 1) return null

  return (
    <div className="flex items-center justify-between mt-4 bg-white rounded-lg border border-gray-200 px-4 py-3">
      <button
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        className="text-sm font-medium text-gray-600 hover:text-gray-900 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        &larr; Previous
      </button>
      <span className="text-xs text-gray-500">
        Page {page} of {totalPages} · {total} total
      </span>
      <button
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        className="text-sm font-medium text-gray-600 hover:text-gray-900 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Next &rarr;
      </button>
    </div>
  )
}
