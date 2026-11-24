import { describe, expect, test } from 'vitest'
import {
  applyMessage,
  applySnapshot,
  createRunState,
  selectConnection,
  selectRunStatus,
} from '../../src/lib/runState'
import type { RunState } from '../../src/lib/runState'
import { runEvent, stepEvent } from './helpers'

const fold = (frames: unknown[], from: RunState = createRunState()) =>
  frames.reduce<RunState>((s, f) => applyMessage(s, f), from)

describe('gap note', () => {
  test('counts only the events that were actually lost', () => {
    // 3 arrived early; only 2 is gone when the server says it holds from 4.
    const s = fold([
      stepEvent(1, 'step.started'),
      stepEvent(3, 'step.started', 'b'),
      { type: 'gap', from: 1, earliest: 4 },
    ])
    expect(selectConnection(s).note).toBe(
      '1 event before #4 was lost while disconnected. This record is incomplete.',
    )
  })

  test('says how many were lost when there are several', () => {
    const s = fold([
      stepEvent(1, 'step.started'),
      { type: 'gap', from: 1, earliest: 5 },
    ])
    expect(selectConnection(s).note).toBe(
      '3 events before #5 were lost while disconnected. This record is incomplete.',
    )
  })
})

describe('completed is final', () => {
  test('a step event replayed after a completed snapshot does not reopen the run', () => {
    const done = applySnapshot(createRunState(), {
      seq: 26,
      run: { id: 'r-1', status: 'completed', steps: [] },
    })
    expect(selectRunStatus(fold([stepEvent(27, 'step.finished')], done))).toBe(
      'completed',
    )
  })

  test('run.completed after a step event still completes the run', () => {
    const s = fold([
      stepEvent(1, 'step.finished'),
      runEvent(2, 'run.completed'),
    ])
    expect(selectRunStatus(s)).toBe('completed')
  })
})
