// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'
import { FailurePanel } from '../../src/components/failures/FailurePanel'
import { applyEvent, createRunState } from '../../src/lib/runState'
import type { LabEvent, RunState } from '../../src/lib/runState'
import { fault, runEvent, stepEvent } from '../state/helpers'

afterEach(cleanup)

const show = (events: LabEvent[]) =>
  render(
    <FailurePanel
      state={events.reduce<RunState>(
        (s, e) => applyEvent(s, e),
        createRunState(),
      )}
      runId="r-1"
    />,
  )

const failedStep = (seq: number, stepId: string) =>
  stepEvent(seq, 'step.failed', stepId, 1, { error: fault() })

describe('FailurePanel: headings and history wording', () => {
  test('two failures in a blocked run are counted in the plural', () => {
    show([failedStep(1, 'a'), failedStep(2, 'b'), runEvent(3, 'run.blocked')])
    expect(screen.getByRole('heading').textContent).toBe(
      'Run blocked — 2 steps need attention',
    )
  })

  test('two failures while the run continues are counted in the plural', () => {
    show([failedStep(1, 'a'), failedStep(2, 'b')])
    expect(screen.getByRole('heading').textContent).toBe(
      '2 steps failed — needs attention',
    )
  })

  test('a retried failure with no error code does not show empty brackets', () => {
    show([
      stepEvent(1, 'step.failed', 'a'),
      stepEvent(2, 'step.finished', 'a', 2),
    ])
    expect(screen.getByRole('listitem').textContent).toBe(
      'a attempt 1 failed — retried as attempt 2, done',
    )
  })
})
