// @vitest-environment jsdom
import { fireEvent, render } from '@testing-library/react'
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
  it('shows a clear button when clearable and a value is set', () => {
    const { container } = render(<HotkeyRecorder value="F8" onChange={vi.fn()} clearable />)
    expect(container.querySelector('button[title="Clear hotkey"]')).toBeTruthy()
  })
  it('does not show a clear button when not clearable', () => {
    const { container } = render(<HotkeyRecorder value="F8" onChange={vi.fn()} />)
    expect(container.querySelector('button[title="Clear hotkey"]')).toBeNull()
  })
  it('does not show a clear button when clearable but empty', () => {
    const { container } = render(<HotkeyRecorder value="" onChange={vi.fn()} clearable />)
    expect(container.querySelector('button[title="Clear hotkey"]')).toBeNull()
  })
  it('clears the hotkey via onChange("") when the clear button is clicked', () => {
    const onChange = vi.fn()
    const { container } = render(<HotkeyRecorder value="F8" onChange={onChange} clearable />)
    const btn = container.querySelector('button[title="Clear hotkey"]') as HTMLButtonElement
    fireEvent.click(btn)
    expect(onChange).toHaveBeenCalledWith('')
  })
})
