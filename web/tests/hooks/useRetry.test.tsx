// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { useRetry } from '../../src/hooks/useRetry'
import { requestRetry } from '../../src/lib/retry'

vi.mock('../../src/lib/retry', () => ({ requestRetry: vi.fn() }))
const mocked = vi.mocked(requestRetry)

describe('useRetry', () => {
  test('starts idle', () => {
    const { result } = renderHook(() => useRetry('r-1', 'warm'))
    expect(result.current.state).toEqual({ phase: 'idle' })
  })

  test('is sending while the request is in flight, then holds the result', async () => {
    let resolve!: (v: Awaited<ReturnType<typeof requestRetry>>) => void
    mocked.mockReturnValue(new Promise((r) => (resolve = r)))
    const { result } = renderHook(() => useRetry('r-1', 'warm'))

    let pending!: Promise<void>
    act(() => {
      pending = result.current.retry()
    })
    expect(result.current.state).toEqual({ phase: 'sending' })

    await act(async () => {
      resolve({ kind: 'queued', attempt: 2 })
      await pending
    })
    expect(result.current.state).toEqual({
      phase: 'done',
      result: { kind: 'queued', attempt: 2 },
    })
    expect(mocked).toHaveBeenCalledWith('r-1', 'warm')
  })
})
