import { useCallback, useState } from 'react'
import { requestRetry } from '../lib/retry'
import type { RetryResult } from '../lib/retry'

export type RetryState =
  | { phase: 'idle' }
  | { phase: 'sending' }
  | { phase: 'done'; result: RetryResult }

/** Sends a retry for one step and remembers what the server answered. */
export function useRetry(runId: string, stepId: string) {
  const [state, setState] = useState<RetryState>({ phase: 'idle' })

  const retry = useCallback(async () => {
    setState({ phase: 'sending' })
    setState({ phase: 'done', result: await requestRetry(runId, stepId) })
  }, [runId, stepId])

  return { state, retry }
}
