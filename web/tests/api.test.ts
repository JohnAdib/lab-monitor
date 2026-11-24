import { afterEach, describe, expect, test, vi } from 'vitest'
import { fetchSnapshot } from '../src/lib/api'

afterEach(() => vi.unstubAllGlobals())

describe('fetchSnapshot', () => {
  test('an error response is a failure, not a snapshot', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ error: 'no such run' }, { status: 404 }),
      ),
    )
    await expect(fetchSnapshot('r-9')).rejects.toThrow('404')
  })

  test('a successful response is returned as the snapshot', async () => {
    const snap = { seq: 3, run: { id: 'r-1', status: 'running', steps: [] } }
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(snap)),
    )
    expect(await fetchSnapshot('r-1')).toEqual(snap)
  })
})
