// The shapes the state layer works in. runState.ts re-exports the public ones.
import type { StepError } from '../types'

export type AttemptStatus = 'dispatched' | 'running' | 'done' | 'failed'

/** One occupancy of one device by one step. */
export interface Attempt {
  stepId: string
  attempt: number
  deviceId: string
  status: AttemptStatus
  refused: boolean
  /** Epoch ms, or null while the instrument has not confirmed it started. */
  startedAt: number | null
  /** Epoch ms, or null while it is still running. Never guess this. */
  endedAt: number | null
  /** Why it failed, when it did. Null otherwise. */
  error: StepError | null
}

export interface Track {
  deviceId: string
  attempts: Attempt[]
}

export type ConnectionStatus = 'connecting' | 'live' | 'stale' | 'gap'

export interface Connection {
  status: ConnectionStatus
  /** Highest sequence number applied so far. */
  lastSeq: number
  /** Shown to the user when the status is not 'live'. */
  note?: string
}

export type Transport = 'connecting' | 'open' | 'closed'

/** Where the client sits in the stream. */
export interface Sequence {
  /** Every seq up to and including this one is accounted for. */
  last: number
  /** Seqs above `last` already applied, ascending. */
  ahead: number[]
  /** Highest seq of an event after which the run goes quiet (run.*). */
  settleAt: number
}

export interface RunState {
  runId: string | null
  runStatus: string
  /** Seq that set runStatus, so older news cannot overwrite it. */
  statusSeq: number
  /** Keyed `stepId#attempt`. */
  attempts: Record<string, Attempt>
  seq: Sequence
  transport: Transport
  /** Set once the server says events were lost. Never cleared. */
  lostNote: string | null
}
