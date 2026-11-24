import { describe, expect, test } from 'vitest'
import {
  applyEvent,
  applySnapshot,
  createRunState,
  selectFailures,
} from '../../src/lib/runState'
import type { LabEvent, RunState } from '../../src/lib/runState'
import { fault, runEvent, stepEvent } from './helpers'

const fold = (events: LabEvent[], from = createRunState()) =>
  events.reduce<RunState>((s, e) => applyEvent(s, e), from)

const failed = (seq: number, attempt: number) =>
  stepEvent(seq, 'step.failed', 'warm', attempt, { error: fault() })

describe('failures: when the run has moved on', () => {
  test('a completed run has nothing left to act on, even if the retry was missed', () => {
    const { active, resolved } = selectFailures(
      fold([failed(1, 1), runEvent(9, 'run.completed')]),
    )
    expect(active).toEqual([])
    expect(resolved).toEqual([{ failed: expect.anything(), retry: null }])
  })

  test('a snapshot saying completed also clears what needs action', () => {
    const s = applySnapshot(fold([failed(1, 1)]), {
      seq: 9,
      run: { id: 'r-1', status: 'completed', steps: [] },
    })
    expect(selectFailures(s).active).toEqual([])
  })

  test('when the very next attempt was missed, the failure pairs with the latest one', () => {
    const { resolved } = selectFailures(
      fold([failed(1, 1), stepEvent(3, 'step.started', 'warm', 3)]),
    )
    expect(resolved[0]!.retry?.attempt).toBe(3)
  })

  test('each failure is paired with the attempt that directly followed it', () => {
    const { resolved } = selectFailures(
      fold([
        failed(1, 1),
        failed(2, 2),
        stepEvent(3, 'step.started', 'warm', 3),
      ]),
    )
    expect(resolved.map((r) => [r.failed.attempt, r.retry?.attempt])).toEqual([
      [1, 2],
      [2, 3],
    ])
  })
})
