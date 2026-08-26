/**
 * Client for the (mock) external system.
 *
 * Design constraints taken from the requirements:
 *  - the external system may be unavailable, error, respond slowly, or receive
 *    duplicate requests
 *  - a synchronisation failure must never prevent the application from being
 *    completed locally
 *
 * Therefore this module never throws. Every outcome, including a timeout, is
 * returned as a value so the caller can record it and carry on.
 */

const DEFAULT_TIMEOUT_MS = 3000

export type SyncOutcome = 'SYNCED' | 'ALREADY_PROCESSED' | 'FAILED'

export type SyncResult = {
  success: boolean
  outcome: SyncOutcome
  error?: string
  durationMs: number
}

type SyncPayload = {
  applicationId: string
  idempotencyKey: string
  origin: string
  /** Selected business data mirrored to the external system. */
  snapshot?: Record<string, unknown>
}

export async function syncCompletedApplication({
  applicationId,
  idempotencyKey,
  origin,
  snapshot,
}: SyncPayload): Promise<SyncResult> {
  const timeoutMs = Number(process.env.EXTERNAL_SYNC_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS
  const startedAt = Date.now()

  // Guards against the "responds slowly" failure mode: we stop waiting rather
  // than holding the user's request open indefinitely.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(`${origin}/api/mock-external-sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Same key on every attempt, so a retry is recognised as a duplicate
        // rather than creating a second record downstream.
        'x-idempotency-key': idempotencyKey,
      },
      body: JSON.stringify({ applicationId, ...snapshot }),
      signal: controller.signal,
      cache: 'no-store',
    })

    const payload = await response.json().catch(() => ({} as Record<string, unknown>))
    const durationMs = Date.now() - startedAt

    if (!response.ok) {
      return {
        success: false,
        outcome: 'FAILED',
        error:
          (typeof payload.message === 'string' && payload.message) ||
          `External system returned HTTP ${response.status}`,
        durationMs,
      }
    }

    // A duplicate is a success from our point of view: the data is already there.
    const alreadyProcessed = payload.status === 'ALREADY_PROCESSED'

    return {
      success: true,
      outcome: alreadyProcessed ? 'ALREADY_PROCESSED' : 'SYNCED',
      durationMs,
    }
  } catch (error) {
    const durationMs = Date.now() - startedAt
    const timedOut = error instanceof Error && error.name === 'AbortError'

    return {
      success: false,
      outcome: 'FAILED',
      error: timedOut
        ? `External system did not respond within ${timeoutMs}ms`
        : error instanceof Error
          ? error.message
          : 'Unexpected error contacting the external system',
      durationMs,
    }
  } finally {
    clearTimeout(timer)
  }
}
