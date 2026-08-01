// @vitest-environment jsdom

import { fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Chrome } from './Chrome'

describe('Chrome pin toggle', () => {
  afterEach(() => {
    delete (window as unknown as { api?: unknown }).api
  })

  it('loads pin state, renders the toggle, and persists a click', async () => {
    const setOverlayPinned = vi.fn()
    ;(window as unknown as { api: Record<string, unknown> }).api = {
      getOverlayPinned: vi.fn(async () => false),
      setOverlayPinned,
    }
    const { getByTitle } = render(
      <Chrome onClose={() => {}}>
        <div />
      </Chrome>,
    )
    const button = await waitFor(() => getByTitle('Pin: keep open when pressing Esc'))
    fireEvent.click(button)
    expect(setOverlayPinned).toHaveBeenCalledWith(true)
    await waitFor(() => getByTitle('Unpin (Esc closes this window again)'))
  })

  it('renders without the toggle (and without crashing) when the bridge is absent', () => {
    const { container, queryByTitle } = render(
      <Chrome onClose={() => {}}>
        <div data-testid="body" />
      </Chrome>,
    )
    expect(container.querySelector('[data-testid="body"]')).not.toBeNull()
    expect(queryByTitle('Pin: keep open when pressing Esc')).toBeNull()
  })
})
