import { afterEach, describe, expect, test, vi } from 'vitest'
import { requestRetry } from '../src/lib/retry'

const reply = (status: number, body?: unknown) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      body === undefined
        ? new Response('not json', { status })
        : Response.json(body, { status }),
    ),
  )

afterEach(() => vi.unstubAllGlobals())

describe('requestRetry: what each answer means for the screen', () => {
  test('202 is queued with the attempt the retry will run', async () => {
    reply(202, { attempt: 2, status: 'pending', message: 'Retry queued' })
    expect(await requestRetry('r-1', 'warm')).toEqual({
      kind: 'queued',
      attempt: 2,
    })
  })

  test('409 means someone already handled it, with the server message', async () => {
    reply(409, { error: 'not_failed', status: 'pending', message: 'queued' })
    expect(await requestRetry('r-1', 'warm')).toEqual({
      kind: 'alreadyHandled',
      message: 'queued',
    })
  })

  test('422 means retrying cannot help, with the server message', async () => {
    reply(422, { error: 'not_retryable', message: 'Fix the cause first.' })
    expect(await requestRetry('r-1', 'read')).toEqual({
      kind: 'notRetryable',
      message: 'Fix the cause first.',
    })
  })

  test('404 is a failure carrying the server message', async () => {
    reply(404, { error: 'unknown_step', message: 'No such step.' })
    expect(await requestRetry('r-1', 'x')).toEqual({
      kind: 'failed',
      message: 'No such step.',
    })
  })

  test('an answer without a JSON body falls back to a message naming the status', async () => {
    reply(500)
    expect(await requestRetry('r-1', 'x')).toEqual({
      kind: 'failed',
      message: 'The retry request failed (HTTP 500).',
    })
  })

  test('a 202 without an attempt is still queued, attempt unknown', async () => {
    reply(202, {})
    expect(await requestRetry('r-1', 'warm')).toEqual({
      kind: 'queued',
      attempt: null,
    })
  })

  test('a network error is a failure that says the controller was unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed')
      }),
    )
    const result = await requestRetry('r-1', 'warm')
    expect(result.kind).toBe('failed')
    expect(result).toMatchObject({ message: expect.stringContaining('reach') })
  })
})
