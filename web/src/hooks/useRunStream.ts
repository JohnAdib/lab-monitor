import { useEffect, useRef, useState } from 'react'
import { fetchSnapshot } from '../lib/api'
import { connect } from '../lib/socket'
import {
  applyMessage,
  applySnapshot,
  applyTransport,
  createRunState,
  selectResumeFrom,
} from '../lib/runState'
import type { RunState } from '../lib/runState'

/** The run being watched. A new object per Start: a restarted simulator
 *  reuses ids, and the same id must still get a fresh stream. */
export interface WatchedRun {
  id: string
}

/**
 * Live state for one run: load the snapshot, then subscribe from where it sits.
 *
 * The socket opens only after the snapshot is applied. Opening it first would
 * ask to resume from 0, and with a small replay buffer the server would
 * rightly answer that the start of the run is gone.
 */
export function useRunStream(run: WatchedRun | null): RunState {
  const [state, setState] = useState(createRunState)
  // The socket asks where to resume on every attempt; the ref always holds the
  // latest state, even between a frame arriving and React re-rendering.
  const latest = useRef(state)

  useEffect(() => {
    if (!run) return
    const runId = run.id
    // A closed socket still fires onClose (and can deliver a last frame) after
    // we have moved on to another run; those must not touch the new run's state.
    const alive = { current: true }
    const apply = (next: (s: RunState) => RunState) => {
      if (!alive.current) return
      latest.current = next(latest.current)
      setState(latest.current)
    }
    apply(() => createRunState())

    let close = () => {}
    void (async () => {
      const snap = await fetchSnapshot(runId).catch(() => null)
      if (!alive.current) return
      if (snap) apply((s) => applySnapshot(s, snap))
      close = connect(runId, {
        resumeFrom: () => selectResumeFrom(latest.current),
        onMessage: (msg) => apply((s) => applyMessage(s, msg)),
        onOpen: () => apply((s) => applyTransport(s, 'open')),
        onClose: () => apply((s) => applyTransport(s, 'closed')),
      })
    })()
    return () => {
      alive.current = false
      close()
    }
  }, [run])

  return state
}
