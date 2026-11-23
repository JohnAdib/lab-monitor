// Wires the run's live state into the screen. It holds no run logic of its
// own: hooks own the data, selectors decide what it means.
import { useCallback, useState } from 'react'
import { Banner } from '../components/Banner'
import { FailurePanel } from '../components/failures/FailurePanel'
import { Timeline } from '../pages/Timeline'
import { useNow } from '../hooks/useNow'
import { useRunStream } from '../hooks/useRunStream'
import { createRun, startRun } from '../lib/api'
import {
  selectConnection,
  selectRunStatus,
  selectTracks,
} from '../lib/runState'

export function RunPage() {
  const [runId, setRunId] = useState<string | null>(null)
  const state = useRunStream(runId)
  const now = useNow(250) // the clock a running bar is drawn against

  const onStart = useCallback(async () => {
    const id = await createRun()
    setRunId(id)
    await startRun(id)
  }, [])

  const tracks = selectTracks(state)
  const t0 = tracks
    .flatMap((t) => t.attempts.map((a) => a.startedAt))
    .filter((v): v is number => v !== null)
    .reduce<number | null>(
      (min, v) => (min === null || v < min ? v : min),
      null,
    )

  return (
    <div className="mx-auto max-w-6xl p-6 space-y-4 font-sans">
      <header className="flex items-center gap-3">
        <h1 className="text-lg font-semibold">Lab run monitor</h1>
        <span data-testid="run-status" className="text-sm text-slate-600">
          {runId ? `${runId} — ${selectRunStatus(state)}` : 'no run'}
        </span>
        <button
          data-testid="start-run"
          onClick={onStart}
          className="ml-auto rounded bg-slate-900 px-3 py-1.5 text-sm text-white"
        >
          Start a run
        </button>
      </header>

      <Banner connection={selectConnection(state)} />

      <Timeline tracks={tracks} now={now} t0={t0} />

      {runId && <FailurePanel state={state} runId={runId} />}
    </div>
  )
}
