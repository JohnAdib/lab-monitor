// Tracks which sequence numbers have been applied, so duplicates are dropped,
// the resume position never skips a missing event, and a lost one is noticed.
import type { Sequence } from './model'

/** How many events may arrive ahead of a missing one before we call it lost.
 *  shortcut: counts events, not time; switch to a deadline if a real network
 *  reorders across longer windows. */
export const HOLE_TOLERANCE = 5

export const emptySequence: Sequence = { last: 0, ahead: [], settleAt: 0 }

export function isNew(s: Sequence, seq: number): boolean {
  return seq > s.last && !s.ahead.includes(seq)
}

/** Record a new seq. `settles` marks a run-level event: nothing may be missing
 *  before it without the screen saying so. */
export function record(s: Sequence, seq: number, settles: boolean): Sequence {
  const ahead = [...s.ahead, seq].sort((a, b) => a - b)
  const settleAt = settles ? Math.max(s.settleAt, seq) : s.settleAt
  return consume({ last: s.last, ahead, settleAt })
}

/** Jump forward to `seq` (a snapshot or the server's earliest held event). */
export function advanceTo(s: Sequence, seq: number): Sequence {
  const last = Math.max(s.last, seq)
  return consume({ ...s, last, ahead: s.ahead.filter((n) => n > last) })
}

/** How many seqs between `last` and `before` (exclusive) were never applied. */
export function missingBefore(s: Sequence, before: number): number {
  return before - 1 - s.last - s.ahead.filter((n) => n < before).length
}

export function holeOpen(s: Sequence): boolean {
  return s.ahead.length > HOLE_TOLERANCE || s.settleAt > s.last
}

function consume(s: Sequence): Sequence {
  let { last } = s
  const ahead = [...s.ahead]
  while (ahead[0] === last + 1) last = ahead.shift()!
  return { ...s, last, ahead }
}
