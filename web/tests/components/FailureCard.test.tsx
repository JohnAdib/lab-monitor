// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'
import { FailureCard } from '../../src/components/failures/FailureCard'
import type { Attempt } from '../../src/lib/runState'

afterEach(cleanup)

const attempt = (over: Partial<Attempt>): Attempt => ({
  stepId: 'fill_buffer_plate',
  attempt: 1,
  deviceId: 'liquid-handler-1',
  status: 'failed',
  refused: false,
  startedAt: 1000,
  endedAt: 2000,
  error: null,
  ...over,
})

describe('FailureCard: when the instrument said little', () => {
  test('a failure with no error payload says so and still offers a retry', () => {
    render(<FailureCard attempt={attempt({})} runId="r-1" />)
    expect(screen.getByTestId('failure-card').textContent).toContain(
      'The instrument reported a failure with no detail.',
    )
    expect(
      screen.getByRole('button', { name: 'Retry fill_buffer_plate' }),
    ).toBeTruthy()
  })

  test('a failure with a known end time shows when it happened', () => {
    render(<FailureCard attempt={attempt({})} runId="r-1" />)
    expect(screen.getByTestId('failure-card').textContent).toContain(
      ` at ${new Date(2000).toLocaleTimeString()}`,
    )
  })

  test('a failure without an end time does not invent one', () => {
    render(<FailureCard attempt={attempt({ endedAt: null })} runId="r-1" />)
    expect(screen.getByTestId('failure-card').textContent).not.toContain(' at ')
  })
})
