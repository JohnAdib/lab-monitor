import { describe, expect, test } from 'vitest'
import {
  applyEvent,
  applySnapshot,
  createRunState,
  selectFailures,
} from '../../src/lib/runState'
import type { RunState } from '../../src/lib/runState'
import { fault, stepEvent } from './helpers'

const fold = (events: Parameters<typeof applyEvent>[1][]) =>
  events.reduce<RunState>((s, e) => applyEvent(s, e), createRunState())

const failed = (seq: number, attempt = 1, error = fault()) =>
  stepEvent(seq, 'step.failed', 'warm', attempt, { error })

describe('failures: what still needs action', () => {
  test('a step whose latest attempt failed is active', () => {
    const { active, resolved } = selectFailures(fold([failed(1)]))
    expect(active.map((a) => a.stepId)).toEqual(['warm'])
    expect(resolved).toEqual([])
  })

  test('a failure followed by a retry attempt is resolved, not active', () => {
    const { active, resolved } = selectFailures(
      fold([failed(1), stepEvent(2, 'step.started', 'warm', 2)]),
    )
    expect(active).toEqual([])
    expect(resolved).toHaveLength(1)
    expect(resolved[0]!.failed.attempt).toBe(1)
    expect(resolved[0]!.retry.status).toBe('running')
  })

  test('a retry that also failed leaves only the latest failure active', () => {
    const { active, resolved } = selectFailures(fold([failed(1), failed(2, 2)]))
    expect(active.map((a) => a.attempt)).toEqual([2])
    expect(resolved.map((r) => r.failed.attempt)).toEqual([1])
  })

  test('a retry attempt that arrives before the original still supersedes it', () => {
    const { active } = selectFailures(
      fold([stepEvent(2, 'step.started', 'warm', 2), failed(1)]),
    )
    expect(active).toEqual([])
  })

  test('an unretryable failure stays active and keeps retryable false', () => {
    const { active } = selectFailures(
      fold([failed(1, 1, fault({ retryable: false }))]),
    )
    expect(active[0]!.error?.retryable).toBe(false)
  })

  test('failures on different steps are listed in the order they happened', () => {
    const s = fold([
      stepEvent(2, 'step.failed', 'b', 1, { error: fault() }),
      stepEvent(1, 'step.failed', 'a', 1, { error: fault() }),
    ])
    expect(selectFailures(s).active.map((a) => a.stepId)).toEqual(['a', 'b'])
  })

  test('a failure the snapshot reported without an end time is listed first', () => {
    const eventFirst = applyEvent(
      createRunState(),
      stepEvent(1, 'step.failed', 'a', 1, { error: fault() }),
    )
    const s = applySnapshot(eventFirst, {
      seq: 0,
      run: {
        id: 'r-1',
        status: 'blocked',
        steps: [
          {
            id: 'z',
            device_id: 'incubator-1',
            depends_on: null,
            status: 'failed',
            attempt: 1,
            started_at: null,
            ended_at: null,
            error: fault(),
          },
        ],
      },
    })
    expect(selectFailures(s).active.map((a) => a.stepId)).toEqual(['z', 'a'])
  })

  test('a run with no failures has nothing to show', () => {
    expect(selectFailures(fold([stepEvent(1, 'step.started')]))).toEqual({
      active: [],
      resolved: [],
    })
  })
})
