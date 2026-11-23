// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { useRunStream } from '../../src/hooks/useRunStream'
import { fetchSnapshot } from '../../src/lib/api'
import { connect } from '../../src/lib/socket'
import type { SocketHandlers } from '../../src/lib/socket'
import { selectConnection, selectRunStatus } from '../../src/lib/runState'
import { stepEvent } from '../state/helpers'

vi.mock('../../src/lib/api', () => ({ fetchSnapshot: vi.fn() }))
vi.mock('../../src/lib/socket', () => ({ connect: vi.fn() }))

const close = vi.fn()
let handlers: SocketHandlers
const snap = (id: string, seq: number) => ({
  seq,
  run: { id, status: 'running', steps: [] },
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(fetchSnapshot).mockImplementation(async (id) => snap(id, 12))
  vi.mocked(connect).mockImplementation((_, h) => {
    handlers = h
    return close
  })
})

const mount = async (runId: string | null = 'r-1') => {
  const hook = renderHook(({ id }) => useRunStream(id), {
    initialProps: { id: runId },
  })
  await act(async () => {})
  return hook
}

describe('useRunStream', () => {
  test('does nothing until there is a run', async () => {
    await mount(null)
    expect(fetchSnapshot).not.toHaveBeenCalled()
    expect(connect).not.toHaveBeenCalled()
  })

  test('connects only after the snapshot, resuming from its seq', async () => {
    const { result } = await mount()
    expect(connect).toHaveBeenCalledOnce()
    expect(handlers.resumeFrom()).toBe(12)
    expect(selectRunStatus(result.current)).toBe('running')
  })

  test('frames and transport changes off the socket reach the state', async () => {
    const { result } = await mount()
    act(() => handlers.onOpen())
    expect(selectConnection(result.current).status).toBe('live')
    act(() => handlers.onMessage(stepEvent(13, 'step.started')))
    expect(handlers.resumeFrom()).toBe(13)
    act(() => handlers.onClose())
    expect(selectConnection(result.current).status).toBe('stale')
  })

  test('still connects, from the start, when the snapshot cannot be fetched', async () => {
    vi.mocked(fetchSnapshot).mockRejectedValue(new Error('down'))
    await mount()
    expect(handlers.resumeFrom()).toBe(0)
  })

  test('unmounting before the snapshot arrives never opens a socket', async () => {
    let arrive!: (s: ReturnType<typeof snap>) => void
    vi.mocked(fetchSnapshot).mockReturnValue(new Promise((r) => (arrive = r)))
    const { unmount } = await mount()
    unmount()
    await act(async () => arrive(snap('r-1', 12)))
    expect(connect).not.toHaveBeenCalled()
  })

  test('a new run closes the old socket and starts from a clean state', async () => {
    const { result, rerender } = await mount('r-1')
    act(() => handlers.onMessage(stepEvent(13, 'step.started')))
    rerender({ id: 'r-2' })
    await act(async () => {})
    expect(close).toHaveBeenCalledOnce()
    expect(result.current.runId).toBe('r-2')
    expect(Object.keys(result.current.attempts)).toEqual([])
  })
})
