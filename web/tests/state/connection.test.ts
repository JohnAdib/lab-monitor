import { describe, expect, test } from 'vitest'
import {
  applyMessage,
  applyTransport,
  createRunState,
  selectConnection,
  selectResumeFrom,
} from '../../src/lib/runState'
import type { RunState } from '../../src/lib/runState'
import { runEvent, stepEvent } from './helpers'

const open = () => applyTransport(createRunState(), 'open')
const fold = (frames: unknown[], from: RunState = open()) =>
  frames.reduce<RunState>((s, f) => applyMessage(s, f), from)
const status = (s: RunState) => selectConnection(s).status

describe('connection: transport', () => {
  test('a new state is connecting', () => {
    expect(status(createRunState())).toBe('connecting')
  })

  test('an open socket with nothing missing is live', () => {
    expect(status(open())).toBe('live')
  })

  test('a closed socket is stale, and reopening it is live again', () => {
    const closed = applyTransport(open(), 'closed')
    expect(status(closed)).toBe('stale')
    expect(status(applyTransport(closed, 'open'))).toBe('live')
  })
})

describe('connection: a hole in the sequence', () => {
  test('a lost event before the run completes is not reported live', () => {
    const s = fold([stepEvent(1, 'step.started'), runEvent(3, 'run.completed')])
    expect(selectConnection(s)).toMatchObject({ status: 'stale', lastSeq: 1 })
    expect(selectConnection(s).note).toContain('2')
  })

  test('a lost event before the run blocks is not reported live', () => {
    expect(
      status(fold([stepEvent(1, 'step.started'), runEvent(3, 'run.blocked')])),
    ).toBe('stale')
  })

  test('resume position stays before the hole so a reconnect asks for it again', () => {
    expect(
      selectResumeFrom(
        fold([stepEvent(1, 'step.started'), runEvent(3, 'run.blocked')]),
      ),
    ).toBe(1)
  })
})

describe('connection: the server says events are gone', () => {
  const lost = () =>
    fold([stepEvent(1, 'step.started'), { type: 'gap', from: 1, earliest: 5 }])

  test('a gap frame reports gap with a note naming the lost range', () => {
    expect(selectConnection(lost())).toMatchObject({
      status: 'gap',
      lastSeq: 4,
    })
    expect(selectConnection(lost()).note).toContain('3 events before #5')
  })

  test('a gap stays reported when the socket closes', () => {
    expect(status(applyTransport(lost(), 'closed'))).toBe('gap')
  })

  test('events after the gap continue from the earliest the server still held', () => {
    expect(
      selectResumeFrom(fold([stepEvent(5, 'step.finished')], lost())),
    ).toBe(5)
  })

  test('a gap frame the client has already moved past is ignored', () => {
    const ahead = fold(
      [1, 2, 3, 4, 5, 6].map((n) => stepEvent(n, 'step.started', `s${n}`)),
    )
    expect(
      status(applyMessage(ahead, { type: 'gap', from: 1, earliest: 5 })),
    ).toBe('live')
  })

  test('a frame that is neither an event nor a gap leaves the state unchanged', () => {
    const s = open()
    expect(applyMessage(s, { type: 'hello' })).toBe(s)
  })
})
