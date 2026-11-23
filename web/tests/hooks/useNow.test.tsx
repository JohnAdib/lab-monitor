// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { useNow } from '../../src/hooks/useNow'

afterEach(() => vi.useRealTimers())

describe('useNow', () => {
  test('advances on its interval and stops when unmounted', () => {
    vi.useFakeTimers({ now: 1000 })
    const { result, unmount } = renderHook(() => useNow(250))
    expect(result.current).toBe(1000)

    act(() => void vi.advanceTimersByTime(250))
    expect(result.current).toBe(1250)

    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
