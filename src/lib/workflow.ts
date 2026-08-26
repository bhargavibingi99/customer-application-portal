/**
 * Domain rules for the application workflow.
 *
 * This module is the single source of truth for:
 *   - which stages, priorities and roles exist
 *   - which stage transitions are legal
 *   - who is allowed to do what
 *   - which applications a given user is allowed to see
 *
 * API routes import from here rather than re-implementing checks, so the rules
 * cannot drift between endpoints. The UI imports the same helpers to decide
 * which controls to show, but the UI is only a convenience: every rule is
 * re-checked on the server before anything is written.
 */

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

export const APPLICATION_STAGES = [
  'NEW',
  'WAITING_FOR_INFO',
  'IN_PROGRESS',
  'UNDER_REVIEW',
  'COMPLETED',
] as const

export const APPLICATION_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const

export const WORK_ITEM_STATUSES = ['PENDING', 'IN_PROGRESS', 'COMPLETED'] as const

export const USER_ROLES = ['ADMIN', 'MANAGER', 'EXECUTIVE'] as const

export type ApplicationStage = (typeof APPLICATION_STAGES)[number]
export type Priority = (typeof APPLICATION_PRIORITIES)[number]
export type WorkItemStatus = (typeof WORK_ITEM_STATUSES)[number]
export type Role = (typeof USER_ROLES)[number]

export const isApplicationStage = (v: string): v is ApplicationStage =>
  APPLICATION_STAGES.includes(v as ApplicationStage)

export const isPriority = (v: string): v is Priority =>
  APPLICATION_PRIORITIES.includes(v as Priority)

export const isWorkItemStatus = (v: string): v is WorkItemStatus =>
  WORK_ITEM_STATUSES.includes(v as WorkItemStatus)

export const isRole = (v: string): v is Role => USER_ROLES.includes(v as Role)

/** Human-readable stage label, e.g. WAITING_FOR_INFO -> "Waiting for Information". */
export function stageLabel(stage: string): string {
  const labels: Record<string, string> = {
    NEW: 'New',
    WAITING_FOR_INFO: 'Waiting for Information',
    IN_PROGRESS: 'In Progress',
    UNDER_REVIEW: 'Under Review',
    COMPLETED: 'Completed',
  }
  return labels[stage] ?? stage.replace(/_/g, ' ')
}

// ---------------------------------------------------------------------------
// Workflow transitions
// ---------------------------------------------------------------------------

/**
 * Legal forward/backward moves. Anything not listed here is rejected.
 *
 * COMPLETED is intentionally terminal: reopening is an administrative override
 * rather than a normal workflow step (see REOPEN_STAGE / canReopen).
 */
export const ALLOWED_TRANSITIONS: Record<ApplicationStage, ApplicationStage[]> = {
  NEW: ['WAITING_FOR_INFO', 'IN_PROGRESS'],
  WAITING_FOR_INFO: ['IN_PROGRESS', 'UNDER_REVIEW'],
  IN_PROGRESS: ['WAITING_FOR_INFO', 'UNDER_REVIEW'],
  UNDER_REVIEW: ['IN_PROGRESS', 'COMPLETED'],
  COMPLETED: [],
}

/** Stage a reopened application returns to. */
export const REOPEN_STAGE: ApplicationStage = 'IN_PROGRESS'

/**
 * Transitions that require approval authority rather than just doing the work.
 *
 * Separation of duties: the executive who performed the work must not be the
 * one who signs it off, so the final move into COMPLETED is reserved for
 * managers and administrators.
 */
const APPROVAL_ONLY_TARGETS: ApplicationStage[] = ['COMPLETED']

export const canApproveCompletion = (role: Role) => role === 'ADMIN' || role === 'MANAGER'
export const canReopen = (role: Role) => role === 'ADMIN'
export const canAssign = (role: Role) => role === 'ADMIN' || role === 'MANAGER'
export const canEditPriority = (role: Role) => role === 'ADMIN' || role === 'MANAGER'
export const canManageUsers = (role: Role) => role === 'ADMIN'

export type TransitionCheck = { valid: true } | { valid: false; reason: string }

/**
 * Validates a stage change for a specific actor.
 *
 * `isAssignee` lets an executive progress their own application while still
 * being blocked from approving it.
 */
export function validateStageTransition(
  currentStage: ApplicationStage,
  nextStage: ApplicationStage,
  role: Role,
  isAssignee = false
): TransitionCheck {
  if (currentStage === nextStage) return { valid: true }

  // Reopening a finished application is an admin-only override.
  if (currentStage === 'COMPLETED') {
    if (!canReopen(role)) {
      return {
        valid: false,
        reason: 'This application is completed. Only an administrator can reopen it.',
      }
    }
    if (nextStage !== REOPEN_STAGE) {
      return {
        valid: false,
        reason: `A completed application can only be reopened into ${stageLabel(REOPEN_STAGE)}.`,
      }
    }
    return { valid: true }
  }

  const allowed = ALLOWED_TRANSITIONS[currentStage] ?? []
  if (!allowed.includes(nextStage)) {
    return {
      valid: false,
      reason: `Cannot move from ${stageLabel(currentStage)} to ${stageLabel(nextStage)}. Allowed next stages: ${
        allowed.map(stageLabel).join(', ') || 'none'
      }.`,
    }
  }

  if (APPROVAL_ONLY_TARGETS.includes(nextStage) && !canApproveCompletion(role)) {
    return {
      valid: false,
      reason: 'Only a manager or administrator can complete an application.',
    }
  }

  // Executives may only progress work they are personally responsible for.
  if (role === 'EXECUTIVE' && !isAssignee) {
    return {
      valid: false,
      reason: 'You can only change the stage of applications assigned to you.',
    }
  }

  return { valid: true }
}

/** Stages the given actor could legally move this application to right now. */
export function availableTransitions(
  currentStage: ApplicationStage,
  role: Role,
  isAssignee = false
): ApplicationStage[] {
  if (currentStage === 'COMPLETED') {
    return canReopen(role) ? [REOPEN_STAGE] : []
  }
  return (ALLOWED_TRANSITIONS[currentStage] ?? []).filter(
    (next) => validateStageTransition(currentStage, next, role, isAssignee).valid
  )
}

// ---------------------------------------------------------------------------
// Visibility scoping
// ---------------------------------------------------------------------------

export type Actor = {
  id: string
  role: string
  teamId: string | null
}

/**
 * Builds the Prisma `where` fragment describing which applications an actor
 * may see. Applied on the server for every list and detail read, so narrowing
 * is not something the client can opt out of.
 *
 *  - ADMIN      : everything
 *  - MANAGER    : anything assigned to a member of their team, plus unassigned
 *                 work so they can triage and hand it out
 *  - EXECUTIVE  : only what is assigned to them
 */
export function applicationVisibilityFilter(actor: Actor): Record<string, unknown> {
  if (actor.role === 'ADMIN') return {}

  if (actor.role === 'MANAGER') {
    return {
      OR: [
        { assignedUser: { teamId: actor.teamId } },
        { assignedUserId: null },
      ],
    }
  }

  return { assignedUserId: actor.id }
}

/** Whether an actor may read one specific application. */
export function canViewApplication(
  actor: Actor,
  application: { assignedUserId: string | null; assignedUser?: { teamId: string | null } | null }
): boolean {
  if (actor.role === 'ADMIN') return true

  if (actor.role === 'MANAGER') {
    if (application.assignedUserId === null) return true
    return (application.assignedUser?.teamId ?? null) === actor.teamId
  }

  return application.assignedUserId === actor.id
}
