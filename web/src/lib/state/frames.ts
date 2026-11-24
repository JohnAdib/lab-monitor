// Not every frame on the wire is a LabEvent. These guards decide what one is;
// anything they reject is ignored by the state layer.
import type { EventType, LabEvent } from '../types'

/** Sent by the server before a replay it cannot complete. */
export interface GapFrame {
  type: 'gap'
  /** The position the client asked to resume from. */
  from: number
  /** The oldest seq the server still holds; everything between was lost. */
  earliest: number
}

const EVENT_TYPES = new Set<EventType>([
  'step.dispatched',
  'step.refused',
  'step.started',
  'step.finished',
  'step.failed',
  'run.blocked',
  'run.completed',
])

type Loose = Record<string, unknown>
const isObject = (m: unknown): m is Loose => typeof m === 'object' && m !== null
const isString = (v: unknown) => typeof v === 'string' && v !== ''
const isCount = (v: unknown, min: number) =>
  Number.isInteger(v) && (v as number) >= min

export function isLabEvent(m: unknown): m is LabEvent {
  if (!isObject(m) || !EVENT_TYPES.has(m.type as EventType)) return false
  if (!isCount(m.seq, 1)) return false
  if (!isString(m.run_id) || !isString(m.at)) return false
  if ((m.type as string).startsWith('run.')) return true
  return isString(m.step_id) && isCount(m.attempt, 1) && isString(m.device_id)
}

export function isGapFrame(m: unknown): m is GapFrame {
  return (
    isObject(m) &&
    m.type === 'gap' &&
    isCount(m.from, 0) &&
    isCount(m.earliest, 1)
  )
}
