// @vitest-environment jsdom
import type { PriceCheck, SnapshotItem } from '@scalpel/stream-contract'
import { render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { sampleSnapshot } from '../test-helpers'
import { CardOrPriceCheck, type CheckableItem } from './CardOrPriceCheck'

const check: PriceCheck = { league: 'L', body: { query: {} }, rows: [] }

function Harness({ item }: { item: CheckableItem }): JSX.Element {
  const [checking, setChecking] = useState<CheckableItem | null>(null)
  return (
    <>
      <button onClick={() => setChecking(item)}>open</button>
      <CardOrPriceCheck item={item} checking={checking} canCheck onCheck={setChecking} />
    </>
  )
}

afterEach(() => vi.restoreAllMocks())

describe('CardOrPriceCheck width', () => {
  it('gives the price checker the width of the card it replaced', async () => {
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('ssv-tooltip') ? 347 : 0
    })
    const item = { ...(sampleSnapshot().equipment.Ring as SnapshotItem), priceCheck: check }
    render(<Harness item={item} />)
    screen.getByText('open').click()
    const panel = await screen.findByRole('region', { name: 'Price check' })
    expect(panel).toHaveStyle({ width: '347px' })
  })
})
