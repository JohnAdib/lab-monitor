// One failure that still needs someone to act on it.
import { Badge } from '../Badge'
import { ContextList } from './ContextList'
import { RetryAction } from './RetryAction'
import type { Attempt } from '../../lib/runState'

export function FailureCard({
  attempt,
  runId,
}: {
  attempt: Attempt
  runId: string
}) {
  const { error } = attempt
  return (
    <article
      data-testid="failure-card"
      className="space-y-2 rounded border border-rose-300 bg-rose-50 p-3"
    >
      <header className="flex flex-wrap items-center gap-2">
        <Badge tone="failed">failed</Badge>
        <span className="font-medium">{attempt.stepId}</span>
        <span className="text-xs text-slate-600">
          attempt {attempt.attempt} on {attempt.deviceId}
          {attempt.endedAt !== null &&
            ` at ${new Date(attempt.endedAt).toLocaleTimeString()}`}
        </span>
      </header>
      <p className="text-sm">
        {error?.detail ?? 'The instrument reported a failure with no detail.'}
        {error && (
          <span className="ml-2 font-mono text-xs text-slate-500">
            {error.code}
          </span>
        )}
      </p>
      <ContextList context={error?.context} />
      <RetryAction
        runId={runId}
        stepId={attempt.stepId}
        retryable={error?.retryable ?? true}
      />
    </article>
  )
}
