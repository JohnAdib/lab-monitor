import { describe, expect, test } from 'vitest'
import { isGapFrame, isLabEvent } from '../../src/lib/state/frames'
import { runEvent, stepEvent } from './helpers'

describe('frames: what is a lab event', () => {
  test('a step event with all its fields is a lab event', () => {
    expect(isLabEvent(stepEvent(1, 'step.started'))).toBe(true)
  })

  test('a run-level event without step fields is a lab event', () => {
    expect(isLabEvent(runEvent(1, 'run.completed'))).toBe(true)
  })

  test.each([
    ['null', null],
    ['a string', 'step.started'],
    [
      'an unknown type',
      { ...stepEvent(1, 'step.started'), type: 'step.exploded' },
    ],
    ['seq zero', stepEvent(0, 'step.started')],
    ['a fractional seq', stepEvent(1.5, 'step.started')],
    ['no run_id', { ...stepEvent(1, 'step.started'), run_id: undefined }],
    ['no at', { ...stepEvent(1, 'step.started'), at: undefined }],
    [
      'a step event without step_id',
      { ...stepEvent(1, 'step.started'), step_id: undefined },
    ],
    [
      'a step event without attempt',
      { ...stepEvent(1, 'step.started'), attempt: undefined },
    ],
    [
      'a step event without device_id',
      { ...stepEvent(1, 'step.started'), device_id: undefined },
    ],
  ])('%s is not a lab event', (_, frame) => {
    expect(isLabEvent(frame)).toBe(false)
  })
})

describe('frames: what is a gap frame', () => {
  test('type gap with numeric from and earliest is a gap frame', () => {
    expect(isGapFrame({ type: 'gap', from: 10, earliest: 40 })).toBe(true)
  })

  test.each([
    ['null', null],
    ['a lab event', runEvent(1, 'run.completed')],
    ['a gap without earliest', { type: 'gap', from: 10 }],
    ['a gap with a string from', { type: 'gap', from: '10', earliest: 40 }],
  ])('%s is not a gap frame', (_, frame) => {
    expect(isGapFrame(frame)).toBe(false)
  })
})
