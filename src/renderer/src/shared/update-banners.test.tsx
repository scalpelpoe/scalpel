// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { GITHUB_REPO_URL } from '@shared/endpoints'
import { UpdateAvailableBanner } from './update-banners'

const onDownload = vi.fn()
const onRestart = vi.fn()
const props = { version: '1.0.5-rc2', progress: null, ready: false, onDownload, onRestart }

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

it.each([
  { progress: null, ready: false },
  { progress: 50, ready: false },
  { progress: null, ready: true },
])('offers only manual updates on Linux even with stale state: %j', (state) => {
  const openExternal = vi.fn()
  window.api = { openExternal } as unknown as typeof window.api
  render(<UpdateAvailableBanner {...props} {...state} platform="linux" />)
  expect(screen.getByText(/1.0.5-rc2/)).toBeInTheDocument()
  expect(screen.getByText(/AppImage.*package manager/)).toBeInTheDocument()
  expect(screen.getAllByRole('button')).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: 'View release' }))
  expect(openExternal).toHaveBeenCalledWith(`${GITHUB_REPO_URL}/releases/tag/v1.0.5-rc2`)
  expect(onDownload).not.toHaveBeenCalled()
  expect(onRestart).not.toHaveBeenCalled()
})

it('keeps the Windows download and restart actions', () => {
  const { rerender } = render(<UpdateAvailableBanner {...props} platform="win32" />)
  fireEvent.click(screen.getByRole('button', { name: 'Update' }))
  expect(onDownload).toHaveBeenCalledOnce()
  rerender(<UpdateAvailableBanner {...props} platform="win32" ready />)
  fireEvent.click(screen.getByRole('button', { name: 'Restart' }))
  expect(onRestart).toHaveBeenCalledOnce()
})
