// Folds events and snapshot steps into attempts. Every merge is order-free:
// a field, once reported, is kept, and status only moves forward. So late,
// duplicated or reordered delivery all land on the same attempt.
import type { LabEvent, StepSnapshot } from '../types'
import type { Attempt, AttemptStatus } from './model'

type Patch = Partial<
  Pick<Attempt, 'status' | 'startedAt' | 'endedAt' | 'error' | 'refused'>
>
type Identity = Pick<Attempt, 'stepId' | 'attempt' | 'deviceId'>
type Attempts = Record<string, Attempt>

const RANK: Record<AttemptStatus, number> = {
  dispatched: 0,
  running: 1,
  done: 2,
  failed: 2,
}

const ms = (iso: string | null | undefined) => (iso ? Date.parse(iso) : null)

export function withEvent(attempts: Attempts, e: LabEvent): Attempts {
  if (!e.step_id || !e.attempt || !e.device_id) return attempts
  const id = { stepId: e.step_id, attempt: e.attempt, deviceId: e.device_id }
  return upsert(attempts, id, eventPatch(e))
}

export function withSnapshotStep(
  attempts: Attempts,
  step: StepSnapshot,
): Attempts {
  if (!(step.status in RANK)) return attempts // pending: nothing has happened yet
  const status = step.status as AttemptStatus
  const id = {
    stepId: step.id,
    attempt: step.attempt,
    deviceId: step.device_id,
  }
  return upsert(attempts, id, {
    status,
    startedAt: ms(step.started_at),
    endedAt: RANK[status] === 2 ? ms(step.ended_at) : null,
    error: step.error,
  })
}

function eventPatch(e: LabEvent): Patch {
  switch (e.type) {
    case 'step.dispatched':
      return { status: 'dispatched' }
    case 'step.refused':
      return { refused: true }
    case 'step.started':
      return { status: 'running', startedAt: ms(e.at) }
    case 'step.finished':
      return { status: 'done', endedAt: ms(e.at) }
    default: // step.failed: run.* never reaches here
      return { status: 'failed', endedAt: ms(e.at), error: e.error ?? null }
  }
}

function upsert(attempts: Attempts, id: Identity, p: Patch): Attempts {
  const key = `${id.stepId}#${id.attempt}`
  const cur = attempts[key] ?? blank(id)
  const status =
    p.status && RANK[p.status] > RANK[cur.status] ? p.status : cur.status
  const next: Attempt = {
    ...cur,
    status,
    refused: cur.refused || !!p.refused,
    startedAt: cur.startedAt ?? p.startedAt ?? null,
    endedAt: cur.endedAt ?? p.endedAt ?? null,
    error: cur.error ?? p.error ?? null,
  }
  return { ...attempts, [key]: next }
}

const blank = (id: Identity): Attempt => ({
  ...id,
  status: 'dispatched',
  refused: false,
  startedAt: null,
  endedAt: null,
  error: null,
})
