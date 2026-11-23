import { describe, expect, test } from 'vitest'
import { withEvent } from '../../src/lib/state/attempts'
import { at, fault, runEvent, stepEvent } from './helpers'

const only = (attempts: Record<string, unknown>) => Object.values(attempts)[0]

describe('attempts: folding events', () => {
  test('finished arriving before started still ends as done with both times', () => {
    const a = only(
      withEvent(
        withEvent({}, stepEvent(3, 'step.finished')),
        stepEvent(2, 'step.started'),
      ),
    )
    expect(a).toMatchObject({
      status: 'done',
      startedAt: at(2).getTime(),
      endedAt: at(3).getTime(),
    })
  })

  test('a started attempt has no end time', () => {
    expect(only(withEvent({}, stepEvent(2, 'step.started')))).toMatchObject({
      status: 'running',
      endedAt: null,
    })
  })

  test('a late dispatched does not move a running attempt backwards', () => {
    const running = withEvent({}, stepEvent(2, 'step.started'))
    expect(
      only(withEvent(running, stepEvent(1, 'step.dispatched'))),
    ).toMatchObject({
      status: 'running',
    })
  })

  test('a refusal marks the attempt refused and gives it no times', () => {
    expect(only(withEvent({}, stepEvent(1, 'step.refused')))).toMatchObject({
      refused: true,
      startedAt: null,
      endedAt: null,
    })
  })

  test('a failure keeps the full error, including unknown context keys', () => {
    const error = fault({ context: { brand_new_key: [1, 2] } })
    const a = only(
      withEvent({}, stepEvent(4, 'step.failed', 'warm', 1, { error })),
    )
    expect(a).toMatchObject({
      status: 'failed',
      endedAt: at(4).getTime(),
      error,
    })
  })

  test('a failure without an error payload records null, not undefined', () => {
    expect(only(withEvent({}, stepEvent(4, 'step.failed')))).toMatchObject({
      error: null,
    })
  })

  test('a retry is a separate attempt and leaves the first untouched', () => {
    const first = withEvent(
      {},
      stepEvent(4, 'step.failed', 'warm', 1, { error: fault() }),
    )
    const both = withEvent(first, stepEvent(5, 'step.dispatched', 'warm', 2))
    expect(Object.keys(both).sort()).toEqual(['warm#1', 'warm#2'])
    expect(both['warm#1']).toEqual(first['warm#1'])
  })

  test('a run-level event creates no attempt', () => {
    expect(withEvent({}, runEvent(9, 'run.completed'))).toEqual({})
  })
})
