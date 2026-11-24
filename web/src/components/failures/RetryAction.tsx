// What a scientist can do about one failure: retry it, or, when the instrument
// says retrying cannot help, be told what to do instead.
import { useRetry } from '../../hooks/useRetry'
import type { RetryState } from '../../hooks/useRetry'

interface Props {
  runId: string
  stepId: string
  retryable: boolean
}

export function RetryAction({ runId, stepId, retryable }: Props) {
  if (!retryable) {
    return (
      <p role="note" className="text-sm text-slate-700">
        Retrying will not help: the instrument reports this fault will happen
        again, so this run cannot continue from here. Fix the cause at the
        instrument (see the details above), then start a new run.
      </p>
    )
  }
  return <RetryButton runId={runId} stepId={stepId} />
}

function RetryButton({ runId, stepId }: Omit<Props, 'retryable'>) {
  const { state, retry } = useRetry(runId, stepId)
  const failed = state.phase === 'done' && state.result.kind === 'failed'
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        aria-label={`Retry ${stepId}`}
        disabled={state.phase !== 'idle' && !failed}
        onClick={() => void retry()}
        className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
      >
        {state.phase === 'sending'
          ? 'Sending…'
          : failed
            ? 'Try again'
            : 'Retry step'}
      </button>
      <span role="status" className="text-sm text-slate-700">
        {statusText(state)}
      </span>
    </div>
  )
}

function statusText(state: RetryState): string {
  if (state.phase !== 'done') return ''
  const r = state.result
  if (r.kind !== 'queued') return r.message
  const which = r.attempt === null ? 'it' : `attempt ${r.attempt}`
  return `Retry requested — waiting for the instrument to start ${which}.`
}
