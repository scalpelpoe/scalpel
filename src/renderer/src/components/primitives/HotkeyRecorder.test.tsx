// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { HotkeyRecorder } from './HotkeyRecorder'

describe('HotkeyRecorder', () => {
  it('shows the default placeholder when empty', () => {
    const { getByText } = render(<HotkeyRecorder value="" onChange={vi.fn()} />)
    expect(getByText('(none set)')).toBeTruthy()
  })
  it('shows a custom placeholder when empty', () => {
    const { getByText } = render(<HotkeyRecorder value="" onChange={vi.fn()} placeholder="Set plugin hotkey" />)
    expect(getByText('Set plugin hotkey')).toBeTruthy()
  })
  it('shows the pretty value when set (no placeholder)', () => {
    const { queryByText } = render(<HotkeyRecorder value="F8" onChange={vi.fn()} placeholder="Set plugin hotkey" />)
    expect(queryByText('Set plugin hotkey')).toBeNull()
  })
})
