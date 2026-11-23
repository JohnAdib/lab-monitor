// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'
import { ContextList } from '../../src/components/failures/ContextList'

afterEach(cleanup)

const valueOf = (label: string) =>
  screen.getByText(label).nextSibling?.textContent

describe('ContextList: instrument details nobody enumerated', () => {
  test('renders nothing when the instrument sent no context', () => {
    const { container } = render(<ContextList context={undefined} />)
    expect(container.innerHTML).toBe('')
  })

  test('renders nothing for an empty context', () => {
    const { container } = render(<ContextList context={{}} />)
    expect(container.innerHTML).toBe('')
  })

  test('every key is shown, readable, and in a stable order', () => {
    render(<ContextList context={{ tip_box: 'TIP-07', channel: 4 }} />)
    const labels = screen.getAllByRole('term').map((t) => t.textContent)
    expect(labels).toEqual(['channel', 'tip box'])
  })

  test('values keep their meaning whatever their type', () => {
    render(
      <ContextList
        context={{ ok: false, missing: null, wells: [1, 2], note: 'x' }}
      />,
    )
    expect(valueOf('ok')).toBe('false')
    expect(valueOf('missing')).toBe('—')
    expect(valueOf('wells')).toBe('[1,2]')
    expect(valueOf('note')).toBe('x')
  })
})
