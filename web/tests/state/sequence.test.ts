import { describe, expect, test } from 'vitest'
import {
  HOLE_TOLERANCE,
  advanceTo,
  emptySequence,
  holeOpen,
  isNew,
  record,
} from '../../src/lib/state/sequence'
import type { Sequence } from '../../src/lib/state/model'

const recordAll = (seqs: number[], from: Sequence = emptySequence) =>
  seqs.reduce((s, n) => record(s, n, false), from)

describe('sequence: duplicates', () => {
  test('a seq at or below the contiguous position is not new', () => {
    const s = recordAll([1, 2, 3])
    expect(isNew(s, 3)).toBe(false)
    expect(isNew(s, 1)).toBe(false)
  })

  test('a seq already applied out of order is not new', () => {
    expect(isNew(recordAll([1, 3]), 3)).toBe(false)
  })

  test('the next seq is new', () => {
    expect(isNew(recordAll([1, 2]), 3)).toBe(true)
  })
})

describe('sequence: contiguous position', () => {
  test('in-order delivery advances the position to the last seq', () => {
    expect(recordAll([1, 2, 3]).last).toBe(3)
  })

  test('an early seq waits until the missing one arrives, then both count', () => {
    const early = recordAll([1, 3])
    expect(early.last).toBe(1)
    expect(record(early, 2, false).last).toBe(3)
  })
})

describe('sequence: holes', () => {
  test('a short reorder window is not reported as a hole', () => {
    const seqs = Array.from({ length: HOLE_TOLERANCE }, (_, i) => i + 3)
    expect(holeOpen(recordAll([1, ...seqs]))).toBe(false)
  })

  test('more early events than the tolerance reports a hole', () => {
    const seqs = Array.from({ length: HOLE_TOLERANCE + 1 }, (_, i) => i + 3)
    expect(holeOpen(recordAll([1, ...seqs]))).toBe(true)
  })

  test('a settling event (run-level) beyond a missing seq reports a hole at once', () => {
    expect(holeOpen(record(recordAll([1]), 3, true))).toBe(true)
  })

  test('a settling event that is contiguous is not a hole', () => {
    expect(holeOpen(record(recordAll([1]), 2, true))).toBe(false)
  })

  test('the hole closes when the missing seq arrives', () => {
    const holed = record(recordAll([1]), 3, true)
    expect(holeOpen(record(holed, 2, false))).toBe(false)
  })
})

describe('sequence: advanceTo (snapshot or server gap)', () => {
  test('moves the position forward and absorbs early seqs it now covers', () => {
    const s = advanceTo(recordAll([1, 4, 7]), 5)
    expect(s.last).toBe(5)
    expect(s.ahead).toEqual([7])
  })

  test('consumes early seqs that become contiguous after the jump', () => {
    expect(advanceTo(recordAll([1, 6]), 5).last).toBe(6)
  })

  test('never moves the position backwards', () => {
    expect(advanceTo(recordAll([1, 2, 3]), 2).last).toBe(3)
  })
})
