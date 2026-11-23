// Small builders so each test states only the fields it is about.
import type { EventType, LabEvent, StepError } from '../../src/lib/types'

export const at = (seq: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, seq))

export function runEvent(
  seq: number,
  type: EventType,
  runId = 'r-1',
): LabEvent {
  return { seq, run_id: runId, type, at: at(seq).toISOString() }
}

export function stepEvent(
  seq: number,
  type: EventType,
  stepId = 'warm',
  attempt = 1,
  extra: Partial<LabEvent> = {},
): LabEvent {
  return {
    ...runEvent(seq, type),
    step_id: stepId,
    attempt,
    device_id: 'incubator-1',
    ...extra,
  }
}

export const fault = (over: Partial<StepError> = {}): StepError => ({
  code: 'SETPOINT_NOT_REACHED',
  instrument: 'incubator-1',
  detail: 'chamber did not reach 37.0C',
  retryable: true,
  context: { actual_c: 31.2 },
  ...over,
})
