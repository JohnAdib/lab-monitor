// Turns the retry endpoint's answer into what the screen should say. HTTP
// details stop here; components only see a RetryResult.
import { retryStep } from './api'

export type RetryResult =
  /** Accepted, not done: only the event stream confirms the new attempt. */
  | { kind: 'queued'; attempt: number | null }
  /** Someone (or an earlier click) already moved the step out of failed. */
  | { kind: 'alreadyHandled'; message: string }
  /** The instrument says retrying cannot help. */
  | { kind: 'notRetryable'; message: string }
  | { kind: 'failed'; message: string }

interface RetryBody {
  attempt?: number
  message?: string
}

export async function requestRetry(
  runId: string,
  stepId: string,
): Promise<RetryResult> {
  let res: Response
  try {
    res = await retryStep(runId, stepId)
  } catch {
    return {
      kind: 'failed',
      message:
        'Could not reach the lab controller. Check the connection and try again.',
    }
  }
  const body = (await res.json().catch(() => ({}))) as RetryBody
  const message =
    body.message ?? `The retry request failed (HTTP ${res.status}).`
  switch (res.status) {
    case 202:
      return { kind: 'queued', attempt: body.attempt ?? null }
    case 409:
      return { kind: 'alreadyHandled', message }
    case 422:
      return { kind: 'notRetryable', message }
    default:
      return { kind: 'failed', message }
  }
}
