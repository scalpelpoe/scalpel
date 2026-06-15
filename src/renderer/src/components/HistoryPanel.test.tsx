// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, waitFor } from '@testing-library/react'
import { HistoryPanel } from './HistoryPanel'
import type { FilterChange } from '@shared/types'

function installApi(
  canReset: boolean,
  resetResult: { ok: boolean; error?: string } = { ok: true },
  changes: FilterChange[] = [],
): void {
  ;(window as unknown as { api: Partial<typeof window.api> }).api = {
    getHistory: vi.fn(async () => []),
    listVersions: vi.fn(async () => []),
    getFilterResetAvailability: vi.fn(async () => ({ canReset })),
    resetFilterToOnline: vi.fn(async () => resetResult),
    getFilterChanges: vi.fn(async () => changes),
  }
}

describe('HistoryPanel reset button', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('shows Reset Filter when resettable and confirms before resetting', async () => {
    installApi(true)
    const { findByText, queryByText } = render(<HistoryPanel />)
    const resetBtn = await findByText('Reset Filter')
    expect(queryByText('You sure?')).toBeNull()
    fireEvent.click(resetBtn)
    const confirmBtn = await findByText('You sure?')
    fireEvent.click(confirmBtn)
    await waitFor(() => expect(window.api.resetFilterToOnline).toHaveBeenCalled())
  })

  it('hides Reset Filter when not resettable', async () => {
    installApi(false)
    const { findByText, queryByText } = render(<HistoryPanel />)
    await findByText('Create Checkpoint')
    expect(queryByText('Reset Filter')).toBeNull()
  })

  it('surfaces an error and keeps the confirm when reset fails', async () => {
    installApi(true, { ok: false, error: 'Reset boom' })
    const { findByText } = render(<HistoryPanel />)
    fireEvent.click(await findByText('Reset Filter'))
    fireEvent.click(await findByText('You sure?'))
    await findByText('Reset boom') // error surfaced
    expect(await findByText('You sure?')).toBeTruthy() // confirm stays for retry
  })

  it('shows the Filter Changes section collapsed with a count and expands on click', async () => {
    installApi(false, { ok: true }, [
      { id: '0-1', description: 'Set currency/t1 to Hide', timestamp: 1 },
      { id: '1-2', description: 'Moved to t1', itemName: 'Chaos Orb', timestamp: 2 },
    ])
    const { findByText, queryByText } = render(<HistoryPanel />)
    const header = await findByText(/Filter Changes \(2\)/)
    expect(queryByText('Set currency/t1 to Hide')).toBeNull() // collapsed by default
    fireEvent.click(header)
    await findByText('Set currency/t1 to Hide')
    expect(await findByText('Moved to t1')).toBeTruthy()
  })

  it('shows a zero count when there are no changes', async () => {
    installApi(false, { ok: true }, [])
    const { findByText } = render(<HistoryPanel />)
    await findByText(/Filter Changes \(0\)/)
  })
})
