import { describe, expect, test } from 'vitest'
import {
  applyEvent,
  createRunState,
  selectTracks,
} from '../../src/lib/runState'
import type { RunState } from '../../src/lib/runState'
import { stepEvent } from './helpers'

const fold = (
  events: Parameters<typeof applyEvent>[1][],
  from = createRunState(),
) => events.reduce<RunState>((s, e) => applyEvent(s, e), from)

describe('tracks', () => {
  test('one track per known device, in device order, even when empty', () => {
    expect(selectTracks(createRunState()).map((t) => t.deviceId)).toEqual([
      'liquid-handler-1',
      'incubator-1',
      'plate-reader-1',
    ])
  })

  test('attempts on a lane are ordered by start, unstarted last', () => {
    const s = fold([
      stepEvent(1, 'step.refused', 'later'),
      stepEvent(2, 'step.started', 'b'),
      stepEvent(3, 'step.finished', 'b'),
      stepEvent(4, 'step.started', 'a'),
      stepEvent(5, 'step.started', 'b', 2),
    ])
    const lane = selectTracks(s)[1]!.attempts
    expect(lane.map((a) => `${a.stepId}#${a.attempt}`)).toEqual([
      'b#1',
      'a#1',
      'b#2',
      'later#1',
    ])
  })

  test('two unstarted attempts are ordered by step then attempt', () => {
    const s = fold([
      stepEvent(1, 'step.refused', 'b'),
      stepEvent(2, 'step.refused', 'a', 2),
      stepEvent(3, 'step.refused', 'a', 1),
    ])
    expect(
      selectTracks(s)[1]!.attempts.map((a) => `${a.stepId}#${a.attempt}`),
    ).toEqual(['a#1', 'a#2', 'b#1'])
  })

  test('an attempt on a device the screen does not know is kept off the lanes', () => {
    const s = fold([
      stepEvent(1, 'step.started', 'x', 1, { device_id: 'centrifuge-9' }),
    ])
    expect(selectTracks(s).flatMap((t) => t.attempts)).toEqual([])
  })
})
