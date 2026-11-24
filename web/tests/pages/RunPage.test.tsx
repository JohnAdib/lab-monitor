// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'
import { RunPage } from '../../src/pages/RunPage'

afterEach(cleanup)

describe('RunPage before a run exists', () => {
  test('does not claim to be connecting to a run that does not exist', () => {
    render(<RunPage />)
    expect(screen.getByTestId('run-status').textContent).toBe('no run')
    expect(screen.queryByTestId('connection-banner')).toBeNull()
  })
})
