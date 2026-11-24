// The state layer's public API: everything the screen shows comes from here.
// Events apply on arrival and merge order-free (state/attempts.ts); seen seqs
// are tracked apart (state/sequence.ts), so a lost event never freezes the screen.
import type { LabEvent, Snapshot, StepError } from './types'
import { withEvent, withSnapshotStep } from './state/attempts'
import { isGapFrame, isLabEvent } from './state/frames'
import type { GapFrame } from './state/frames'
import {
  advanceTo,
  emptySequence,
  isNew,
  missingBefore,
  record,
} from './state/sequence'
import { runStatusAfter } from './state/runStatus'
import type { RunState } from './state/model'

export type {
  Attempt,
  AttemptStatus,
  Connection,
  ConnectionStatus,
  RunState,
  Track,
} from './state/model'
export {
  selectConnection,
  selectFailures,
  selectResumeFrom,
  selectRunStatus,
  selectTracks,
} from './state/selectors'
export type { ResolvedFailure } from './state/selectors'
export type { LabEvent, Snapshot, StepError }

export function createRunState(): RunState {
  return {
    runId: null,
    runStatus: 'unknown',
    statusSeq: 0,
    attempts: {},
    seq: emptySequence,
    transport: 'connecting',
    lostNote: null,
  }
}

/** Fold in a snapshot. Its seq marks which events it already accounts for. */
export function applySnapshot(state: RunState, snap: Snapshot): RunState {
  const newer = snap.seq >= state.statusSeq
  return {
    ...state,
    runId: snap.run.id,
    runStatus: newer ? snap.run.status : state.runStatus,
    statusSeq: Math.max(state.statusSeq, snap.seq),
    attempts: snap.run.steps.reduce(withSnapshotStep, state.attempts),
    seq: advanceTo(state.seq, snap.seq),
  }
}

/** Fold in one frame off the socket. Frames that are neither an event nor a
 *  gap notice are ignored. */
export function applyMessage(state: RunState, msg: unknown): RunState {
  if (isGapFrame(msg)) return applyGap(state, msg)
  if (isLabEvent(msg)) return applyEvent(state, msg)
  return state
}

/** Fold in one typed event. Duplicates, events the snapshot already covers,
 *  and events from another run change nothing. */
export function applyEvent(state: RunState, e: LabEvent): RunState {
  if (state.runId !== null && e.run_id !== state.runId) return state
  if (!isNew(state.seq, e.seq)) return state
  const runLevel = e.type.startsWith('run.')
  return {
    ...state,
    runId: e.run_id,
    ...(e.seq > state.statusSeq && {
      runStatus: runStatusAfter(state.runStatus, e),
      statusSeq: e.seq,
    }),
    attempts: withEvent(state.attempts, e),
    seq: record(state.seq, e.seq, runLevel),
  }
}

/** A closed socket does not change the lab, only what we can claim to know. */
export function applyTransport(
  state: RunState,
  kind: 'open' | 'closed',
): RunState {
  return { ...state, transport: kind }
}

function applyGap(state: RunState, g: GapFrame): RunState {
  if (g.earliest - 1 <= state.seq.last) return state // already past it
  const n = missingBefore(state.seq, g.earliest) // events that arrived early do not count
  const lostNote = `${n} ${n === 1 ? 'event' : 'events'} before #${g.earliest} ${n === 1 ? 'was' : 'were'} lost while disconnected. This record is incomplete.`
  return { ...state, lostNote, seq: advanceTo(state.seq, g.earliest - 1) }
}
