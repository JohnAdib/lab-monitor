// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'
import { FailurePanel } from '../../src/components/failures/FailurePanel'
import { applyEvent, createRunState } from '../../src/lib/runState'
import type { LabEvent, RunState } from '../../src/lib/runState'
import { fault, runEvent, stepEvent } from '../state/helpers'

afterEach(cleanup)

const fold = (events: LabEvent[]) =>
  events.reduce<RunState>((s, e) => applyEvent(s, e), createRunState())

const failed = (seq: number, error = fault(), attempt = 1) =>
  stepEvent(seq, 'step.failed', 'warm_reagent_plate', attempt, { error })

const show = (events: LabEvent[]) =>
  render(<FailurePanel state={fold(events)} runId="r-1" />)

describe('FailurePanel', () => {
  test('renders nothing when nothing has failed', () => {
    const { container } = show([stepEvent(1, 'step.started')])
    expect(container.innerHTML).toBe('')
  })

  test('a blocked run says so and counts the steps that need attention', () => {
    show([failed(1), runEvent(2, 'run.blocked')])
    expect(screen.getByRole('heading').textContent).toBe(
      'Run blocked — 1 step needs attention',
    )
  })

  test('a failure while the run continues does not claim the run is blocked', () => {
    show([failed(1), stepEvent(2, 'step.started', 'other', 1, {})])
    expect(screen.getByRole('heading').textContent).toBe(
      '1 step failed — needs attention',
    )
  })

  test('a failure card shows what failed, where, why, and the instrument details', () => {
    show([failed(1)])
    const card = screen.getByTestId('failure-card')
    expect(card.textContent).toContain('warm_reagent_plate')
    expect(card.textContent).toContain('incubator-1')
    expect(card.textContent).toContain('SETPOINT_NOT_REACHED')
    expect(card.textContent).toContain('chamber did not reach 37.0C')
    expect(screen.getByText('actual c').nextSibling?.textContent).toBe('31.2')
  })

  test('a retryable failure offers a retry button', () => {
    show([failed(1)])
    expect(screen.getByRole('button', { name: /retry/i })).toBeTruthy()
  })

  test('an unretryable failure offers guidance instead of a button', () => {
    show([failed(1, fault({ retryable: false }))])
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByRole('note').textContent).toMatch(/retrying will not/i)
    // Retry refuses this fault for good, so the run cannot continue from here.
    expect(screen.getByRole('note').textContent).toMatch(/start a new run/i)
  })

  test('a failure that was retried moves to history and is no longer actionable', () => {
    show([failed(1), stepEvent(2, 'step.started', 'warm_reagent_plate', 2)])
    expect(screen.queryByTestId('failure-card')).toBeNull()
    expect(screen.getByRole('heading').textContent).toBe('Earlier failures')
    expect(screen.getByRole('listitem').textContent).toBe(
      'warm_reagent_plate attempt 1 failed (SETPOINT_NOT_REACHED) — retried as attempt 2, running',
    )
  })
})
