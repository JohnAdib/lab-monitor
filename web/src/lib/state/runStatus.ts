import type { LabEvent } from '../types'

/** The run's status after event `e`. Completed is final: a step event replayed
 *  behind a completed snapshot cannot reopen the run. */
export function runStatusAfter(current: string, e: LabEvent): string {
  if (e.type === 'run.completed' || current === 'completed') return 'completed'
  if (e.type === 'run.blocked') return 'blocked'
  return 'running'
}
