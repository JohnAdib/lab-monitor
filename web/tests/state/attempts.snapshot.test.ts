import { describe, expect, test } from 'vitest'
import { withEvent, withSnapshotStep } from '../../src/lib/state/attempts'
import type { StepSnapshot } from '../../src/lib/types'
import { at, fault, stepEvent } from './helpers'

const only = (attempts: Record<string, unknown>) => Object.values(attempts)[0]

const snapStep = (over: Partial<StepSnapshot>): StepSnapshot => ({
  id: 'warm',
  device_id: 'incubator-1',
  depends_on: null,
  status: 'running',
  attempt: 1,
  started_at: at(2).toISOString(),
  ended_at: null,
  error: null,
  ...over,
})

describe('attempts: folding a snapshot step', () => {
  test('a running step becomes a running attempt with no end', () => {
    expect(only(withSnapshotStep({}, snapStep({})))).toMatchObject({
      status: 'running',
      startedAt: at(2).getTime(),
      endedAt: null,
    })
  })

  test('a dispatched step the instrument has not confirmed has no start', () => {
    const step = snapStep({ status: 'dispatched', started_at: null })
    expect(only(withSnapshotStep({}, step))).toMatchObject({
      status: 'dispatched',
      startedAt: null,
    })
  })

  test('a failed step carries its error and end time', () => {
    const step = snapStep({
      status: 'failed',
      ended_at: at(4).toISOString(),
      error: fault(),
    })
    expect(only(withSnapshotStep({}, step))).toMatchObject({
      status: 'failed',
      endedAt: at(4).getTime(),
      error: fault(),
    })
  })

  test('a pending step (never run, or queued for retry) adds nothing', () => {
    expect(
      withSnapshotStep({}, snapStep({ status: 'pending', started_at: null })),
    ).toEqual({})
  })

  test('an older snapshot does not undo what events already reported', () => {
    const done = withEvent(
      withEvent({}, stepEvent(2, 'step.started')),
      stepEvent(3, 'step.finished'),
    )
    expect(only(withSnapshotStep(done, snapStep({})))).toMatchObject({
      status: 'done',
      endedAt: at(3).getTime(),
    })
  })
})
