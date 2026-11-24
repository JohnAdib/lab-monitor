// Where failures live: below the timeline, actionable ones first. A failure
// that has already been retried is history, not a call to action.
import { selectFailures, selectRunStatus } from '../../lib/runState'
import type { Attempt, ResolvedFailure, RunState } from '../../lib/runState'
import { FailureCard } from './FailureCard'

export function FailurePanel({
  state,
  runId,
}: {
  state: RunState
  runId: string
}) {
  const { active, resolved } = selectFailures(state)
  if (active.length === 0 && resolved.length === 0) return null
  return (
    <section data-testid="failure-panel" className="space-y-3">
      <h2 className="text-sm font-semibold">
        {heading(active.length, selectRunStatus(state) === 'blocked')}
      </h2>
      {active.map((a) => (
        <FailureCard
          key={`${a.stepId}#${a.attempt}`}
          attempt={a}
          runId={runId}
        />
      ))}
      {resolved.length > 0 && (
        <ul className="space-y-1 text-xs text-slate-500">
          {resolved.map((r) => (
            <li key={`${r.failed.stepId}#${r.failed.attempt}`}>{history(r)}</li>
          ))}
        </ul>
      )}
    </section>
  )
}

function heading(count: number, blocked: boolean): string {
  if (count === 0) return 'Earlier failures'
  const steps = count === 1 ? '1 step needs' : `${count} steps need`
  if (blocked) return `Run blocked — ${steps} attention`
  return `${count === 1 ? '1 step' : `${count} steps`} failed — needs attention`
}

function history({ failed, retry }: ResolvedFailure): string {
  const what = `${failed.stepId} attempt ${failed.attempt} failed${failed.error ? ` (${failed.error.code})` : ''}`
  if (!retry) return `${what} — the run completed afterwards`
  return `${what} — retried as attempt ${retry.attempt}, ${progress(retry)}`
}

/** A retry refused by a busy device has not been sent yet; "dispatched" would
 *  claim it had. */
const progress = (a: Attempt) =>
  a.refused && a.startedAt === null && a.status === 'dispatched'
    ? 'waiting for the device'
    : a.status
