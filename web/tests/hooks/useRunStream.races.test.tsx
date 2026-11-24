// @vitest-environment jsdom
// Timing between the snapshot, the socket, and switching runs.
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { useRunStream } from '../../src/hooks/useRunStream'
import { fetchSnapshot } from '../../src/lib/api'
import { connect } from '../../src/lib/socket'
import type { SocketHandlers } from '../../src/lib/socket'
import { selectConnection } from '../../src/lib/runState'
import { stepEvent } from '../state/helpers'

vi.mock('../../src/lib/api', () => ({ fetchSnapshot: vi.fn() }))
vi.mock('../../src/lib/socket', () => ({ connect: vi.fn() }))

const sockets: SocketHandlers[] = []
const snap = (id: string) => ({
  seq: 0,
  run: { id, status: 'running', steps: [] },
})

beforeEach(() => {
  vi.clearAllMocks()
  sockets.length = 0
  vi.mocked(fetchSnapshot).mockImplementation(async (id) => snap(id))
  vi.mocked(connect).mockImplementation((_, h) => {
    sockets.push(h)
    return () => {}
  })
})

const mount = async () => {
  const hook = renderHook(({ run }) => useRunStream(run), {
    initialProps: { run: { id: 'r-1' } },
  })
  await act(async () => {})
  return hook
}

describe('useRunStream: timing', () => {
  test('the socket is not opened while the snapshot is still loading', async () => {
    let arrive!: (s: ReturnType<typeof snap>) => void
    vi.mocked(fetchSnapshot).mockReturnValue(new Promise((r) => (arrive = r)))
    await mount()
    expect(connect).not.toHaveBeenCalled()
    await act(async () => arrive(snap('r-1')))
    expect(connect).toHaveBeenCalledOnce()
  })

  test("the old run's socket closing late does not mark the new run disconnected", async () => {
    const { result, rerender } = await mount()
    const old = sockets[0]!
    rerender({ run: { id: 'r-2' } })
    await act(async () => {})
    act(() => sockets[1]!.onOpen())
    act(() => old.onClose())
    expect(selectConnection(result.current).status).toBe('live')
  })

  test("a late frame from the old run's socket does not reach the new run", async () => {
    const { result, rerender } = await mount()
    const old = sockets[0]!
    rerender({ run: { id: 'r-2' } })
    await act(async () => {})
    act(() => old.onMessage({ ...stepEvent(1, 'step.started'), run_id: 'r-2' }))
    expect(Object.keys(result.current.attempts)).toEqual([])
  })
})
