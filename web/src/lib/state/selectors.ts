// Read-only views of the run state. Pure: same state in, same answer out.
import { DEVICES } from '../types'
import { holeOpen } from './sequence'
import type { Attempt, Connection, RunState, Track } from './model'

export function selectRunStatus(state: RunState): string {
  return state.runStatus
}

/** Resume from the last contiguous seq, so a reconnect also asks for any
 *  event that went missing. */
export function selectResumeFrom(state: RunState): number {
  return state.seq.last
}

export function selectConnection(state: RunState): Connection {
  const lastSeq = state.seq.last
  if (state.lostNote) return { status: 'gap', lastSeq, note: state.lostNote }
  if (state.transport === 'closed') return { status: 'stale', lastSeq }
  if (holeOpen(state.seq)) {
    const note = `Event ${lastSeq + 1} has not arrived. What is shown after it may be incomplete.`
    return { status: 'stale', lastSeq, note }
  }
  if (state.transport === 'connecting') return { status: 'connecting', lastSeq }
  return { status: 'live', lastSeq }
}

/** One track per known device, in DEVICES order. Attempts on an unknown
 *  device stay in the state but have no lane to be drawn on. */
export function selectTracks(state: RunState): Track[] {
  const all = Object.values(state.attempts).sort(byStart)
  return DEVICES.map((deviceId) => ({
    deviceId,
    attempts: all.filter((a) => a.deviceId === deviceId),
  }))
}

export interface ResolvedFailure {
  failed: Attempt
  /** The attempt that followed, or null when the run completed without us
   *  seeing one (e.g. it fell in a gap). */
  retry: Attempt | null
}

/** active: the step's latest attempt failed and the run has not completed, so
 *  someone has to act. resolved: everything else that failed. */
export function selectFailures(state: RunState): {
  active: Attempt[]
  resolved: ResolvedFailure[]
} {
  const latest = new Map<string, Attempt>()
  for (const a of Object.values(state.attempts)) {
    const cur = latest.get(a.stepId)
    if (!cur || a.attempt > cur.attempt) latest.set(a.stepId, a)
  }
  const failed = Object.values(state.attempts)
    .filter((a) => a.status === 'failed')
    .sort((x, y) => endOf(x) - endOf(y))
  const completed = state.runStatus === 'completed'
  const isActive = (a: Attempt) => !completed && latest.get(a.stepId) === a
  const followedBy = (a: Attempt) => {
    const last = latest.get(a.stepId)!
    const next = state.attempts[`${a.stepId}#${a.attempt + 1}`]
    return next ?? (last === a ? null : last)
  }
  return {
    active: failed.filter(isActive),
    resolved: failed
      .filter((a) => !isActive(a))
      .map((a) => ({ failed: a, retry: followedBy(a) })),
  }
}

/** A failure reported without an end time sorts first rather than vanishing. */
const endOf = (a: Attempt) => a.endedAt ?? 0

function byStart(x: Attempt, y: Attempt): number {
  const sx = x.startedAt ?? Infinity
  const sy = y.startedAt ?? Infinity
  if (sx !== sy) return sx < sy ? -1 : 1
  return x.stepId.localeCompare(y.stepId) || x.attempt - y.attempt
}
