import { describe, expect, test } from 'vitest'
import {
  applyEvent,
  applySnapshot,
  createRunState,
  selectRunStatus,
  selectTracks,
} from '../../src/lib/runState'
import type { RunState, Snapshot } from '../../src/lib/runState'
import { runEvent, stepEvent } from './helpers'

const fold = (
  events: Parameters<typeof applyEvent>[1][],
  from = createRunState(),
) => events.reduce<RunState>((s, e) => applyEvent(s, e), from)

const snapshot = (seq: number, status: string, runId = 'r-1'): Snapshot => ({
  seq,
  run: { id: runId, status, steps: [] },
})

describe('run status', () => {
  test('a step event before any snapshot means the run is running', () => {
    expect(selectRunStatus(fold([stepEvent(1, 'step.dispatched')]))).toBe(
      'running',
    )
  })

  test('run.blocked then a retry dispatch means running again', () => {
    const s = fold([
      runEvent(18, 'run.blocked'),
      stepEvent(19, 'step.dispatched', 'warm', 2),
    ])
    expect(selectRunStatus(s)).toBe('running')
  })

  test('a late run.blocked does not undo the retry that followed it', () => {
    const s = fold([
      stepEvent(19, 'step.dispatched', 'warm', 2),
      runEvent(18, 'run.blocked'),
    ])
    expect(selectRunStatus(s)).toBe('running')
  })

  test('run.completed is reported as completed', () => {
    expect(selectRunStatus(fold([runEvent(28, 'run.completed')]))).toBe(
      'completed',
    )
  })

  test('a stale snapshot does not overwrite a newer completed status', () => {
    const done = fold([runEvent(28, 'run.completed')])
    expect(selectRunStatus(applySnapshot(done, snapshot(20, 'running')))).toBe(
      'completed',
    )
  })

  test('a newer snapshot sets the status', () => {
    expect(
      selectRunStatus(applySnapshot(createRunState(), snapshot(3, 'blocked'))),
    ).toBe('blocked')
  })
})

describe('run identity', () => {
  test('events from another run are ignored once the run is known', () => {
    const s = applySnapshot(createRunState(), snapshot(0, 'running', 'r-2'))
    expect(applyEvent(s, stepEvent(1, 'step.started'))).toBe(s)
  })

  test('the first event sets the run when no snapshot has arrived yet', () => {
    const s = fold([
      stepEvent(1, 'step.started'),
      { ...stepEvent(2, 'step.started', 'x'), run_id: 'r-9' },
    ])
    expect(selectTracks(s).flatMap((t) => t.attempts)).toHaveLength(1)
  })
})
