// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { RetryAction } from '../../src/components/failures/RetryAction'
import { requestRetry } from '../../src/lib/retry'
import type { RetryResult } from '../../src/lib/retry'

vi.mock('../../src/lib/retry', () => ({ requestRetry: vi.fn() }))
afterEach(cleanup)

async function clickRetryAnd(result: RetryResult) {
  vi.mocked(requestRetry).mockResolvedValue(result)
  render(<RetryAction runId="r-1" stepId="warm" retryable />)
  await act(async () => {
    fireEvent.click(screen.getByRole('button'))
  })
  return screen.getByRole('button')
}

describe('RetryAction', () => {
  test('the button names the step it retries', () => {
    render(<RetryAction runId="r-1" stepId="warm" retryable />)
    expect(screen.getByRole('button').getAttribute('aria-label')).toBe(
      'Retry warm',
    )
  })

  test('while sending, the button is disabled so a double click cannot fire twice', () => {
    vi.mocked(requestRetry).mockClear()
    vi.mocked(requestRetry).mockReturnValue(new Promise(() => {}))
    render(<RetryAction runId="r-1" stepId="warm" retryable />)
    fireEvent.click(screen.getByRole('button'))
    fireEvent.click(screen.getByRole('button'))
    expect(requestRetry).toHaveBeenCalledOnce()
    expect(screen.getByRole('button').hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button').textContent).toBe('Sending…')
  })

  test('once queued, it waits for the instrument instead of claiming success', async () => {
    const button = await clickRetryAnd({ kind: 'queued', attempt: 2 })
    expect(button.hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('status').textContent).toBe(
      'Retry requested — waiting for the instrument to start attempt 2.',
    )
  })

  test('queued without an attempt number still waits for the instrument', async () => {
    await clickRetryAnd({ kind: 'queued', attempt: null })
    expect(screen.getByRole('status').textContent).toBe(
      'Retry requested — waiting for the instrument to start it.',
    )
  })

  test('already handled elsewhere shows the server message and stays disabled', async () => {
    const button = await clickRetryAnd({
      kind: 'alreadyHandled',
      message: 'Step is pending',
    })
    expect(button.hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('status').textContent).toBe('Step is pending')
  })

  test('refused as not retryable shows why and stays disabled', async () => {
    const button = await clickRetryAnd({
      kind: 'notRetryable',
      message: 'Fix the cause first.',
    })
    expect(button.hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('status').textContent).toBe('Fix the cause first.')
  })

  test('a failed request shows why and lets the user try again', async () => {
    const button = await clickRetryAnd({ kind: 'failed', message: 'Offline' })
    expect(button.hasAttribute('disabled')).toBe(false)
    expect(button.textContent).toBe('Try again')
    expect(screen.getByRole('status').textContent).toBe('Offline')
  })
})
