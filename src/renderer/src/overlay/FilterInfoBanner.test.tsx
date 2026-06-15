// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, waitFor } from '@testing-library/react'
import { m } from '@shared/paraglide/messages.js'
import { FilterInfoBanner } from './FilterInfoBanner'

function installApi(hasOnlineSource: boolean): void {
  ;(window as unknown as { api: Partial<typeof window.api> }).api = {
    getOnlineSyncStatus: vi.fn(async () => ({ hasOnlineSource })),
  }
}

const baseProps = {
  updatedOnlineFilters: new Set<string>(),
  checkingUpdate: false,
  updatingFilter: false,
  mergeMessage: null,
  onQuickUpdate: vi.fn(),
  onCheckForUpdate: vi.fn(),
  onFilterUpdated: vi.fn(),
  onMergeMessage: vi.fn(),
  onSetUpdatingFilter: vi.fn(),
  onSetCheckingUpdate: vi.fn(),
}

describe('FilterInfoBanner online-source state', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('shows the guidance message when the online source is missing', async () => {
    installApi(false)
    const { findByText, queryByText } = render(
      <FilterInfoBanner {...baseProps} filterPath={'C:/x/.5regular-local.filter'} />,
    )
    await findByText(m.filterbanner_load_online_to_sync({ name: '.5regular' }))
    expect(queryByText(m.filterbanner_check_for_updates())).toBeNull()
  })

  it('shows Check for Updates when the online source is present', async () => {
    installApi(true)
    const { findByText, queryByText } = render(
      <FilterInfoBanner {...baseProps} filterPath={'C:/x/.5regular-local.filter'} />,
    )
    await findByText(m.filterbanner_check_for_updates())
    expect(queryByText(m.filterbanner_load_online_to_sync({ name: '.5regular' }))).toBeNull()
  })

  it('shows neither for a non-local (hand-made) filter', () => {
    installApi(true)
    const { queryByText } = render(<FilterInfoBanner {...baseProps} filterPath={'C:/x/myfilter.filter'} />)
    expect(queryByText(m.filterbanner_check_for_updates())).toBeNull()
    expect(queryByText(m.filterbanner_load_online_to_sync({ name: 'myfilter' }))).toBeNull()
  })

  it('rechecks when the guidance message is clicked', async () => {
    installApi(false)
    const { findByText } = render(<FilterInfoBanner {...baseProps} filterPath={'C:/x/.5regular-local.filter'} />)
    const msg = await findByText(m.filterbanner_load_online_to_sync({ name: '.5regular' }))
    ;(window.api.getOnlineSyncStatus as ReturnType<typeof vi.fn>).mockClear()
    fireEvent.click(msg)
    await waitFor(() => expect(window.api.getOnlineSyncStatus).toHaveBeenCalled())
  })
})
