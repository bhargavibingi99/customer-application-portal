import { NextResponse } from 'next/server'

/**
 * Stand-in for the real external system.
 *
 * It deliberately reproduces the failure modes named in the requirements so the
 * calling code can be exercised end to end:
 *   - unavailability / errors  -> random 503 responses
 *   - slow responses           -> random artificial latency
 *   - duplicate requests       -> idempotency key tracking
 *
 * The processed-key store is in-memory, which is fine for a mock but is called
 * out in the README as something that must be durable in production.
 */

type ProcessedRecord = {
  applicationId: string
  processedAt: string
}

const processedKeys = new Map<string, ProcessedRecord>()

const failureRate = () => {
  const parsed = Number(process.env.MOCK_SYNC_FAILURE_RATE)
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 0), 1) : 0.4
}

const maxLatencyMs = () => {
  const parsed = Number(process.env.MOCK_SYNC_MAX_LATENCY_MS)
  return Number.isFinite(parsed) ? Math.max(parsed, 0) : 600
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export async function POST(req: Request) {
  const idempotencyKey = req.headers.get('x-idempotency-key')
  const body = await req.json().catch(() => ({} as Record<string, unknown>))

  // Duplicate detection happens before any failure simulation: an already
  // accepted request must stay accepted, no matter how many times it arrives.
  if (idempotencyKey) {
    const existing = processedKeys.get(idempotencyKey)
    if (existing) {
      return NextResponse.json(
        {
          status: 'ALREADY_PROCESSED',
          message: 'This request was already processed.',
          processedAt: existing.processedAt,
        },
        { status: 200 }
      )
    }
  }

  // Simulate variable latency, including responses slow enough to trip the
  // caller's timeout.
  await sleep(Math.floor(Math.random() * maxLatencyMs()))

  if (Math.random() < failureRate()) {
    return NextResponse.json(
      { message: 'Service temporarily unavailable. Please retry.' },
      { status: 503 }
    )
  }

  const record: ProcessedRecord = {
    applicationId: typeof body.applicationId === 'string' ? body.applicationId : 'unknown',
    processedAt: new Date().toISOString(),
  }

  if (idempotencyKey) processedKeys.set(idempotencyKey, record)

  return NextResponse.json(
    { status: 'SYNCED', message: 'Application recorded in external system.', ...record },
    { status: 200 }
  )
}

/** Small helper endpoint so the mock's state can be inspected while demoing. */
export async function GET() {
  return NextResponse.json({
    processedCount: processedKeys.size,
    failureRate: failureRate(),
    maxLatencyMs: maxLatencyMs(),
    processed: Array.from(processedKeys.entries()).map(([key, value]) => ({
      idempotencyKey: key,
      ...value,
    })),
  })
}
