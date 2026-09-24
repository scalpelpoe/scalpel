// @vitest-environment jsdom
import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useReportInputFocus } from './use-report-input-focus'

let setOverlayInputFocused: ReturnType<typeof vi.fn>

function Harness({ children }: { children: React.ReactNode }): JSX.Element {
  useReportInputFocus()
  return <>{children}</>
}

beforeEach(() => {
  setOverlayInputFocused = vi.fn()
  ;(window as unknown as { api: unknown }).api = { setOverlayInputFocused }
})

afterEach(() => {
  ;(document.activeElement as HTMLElement | null)?.blur()
})

function focus(el: HTMLElement): void {
  act(() => el.focus())
}

describe('useReportInputFocus', () => {
  it('reports text-entry inputs as typing', () => {
    const { getByTestId } = render(
      <Harness>
        <input data-testid="text" type="text" />
        <input data-testid="number" type="number" />
        <input data-testid="plain" />
        <textarea data-testid="area" />
      </Harness>,
    )
    for (const id of ['text', 'number', 'plain', 'area']) {
      setOverlayInputFocused.mockClear()
      focus(getByTestId(id))
      act(() => (getByTestId(id) as HTMLElement).blur())
      expect(setOverlayInputFocused.mock.calls).toEqual([[true], [false]])
    }
  })

  // A focused settings slider suspended every global hotkey, and hiding the
  // overlay never moves focus off it - so the price-check and overlay hotkeys
  // stayed dead until relaunch. Only fields that take typed text count.
  it('does not report sliders, checkboxes or buttons as typing', () => {
    const { getByTestId } = render(
      <Harness>
        <input data-testid="range" type="range" min={50} max={100} step={5} defaultValue={90} />
        <input data-testid="checkbox" type="checkbox" />
        <input data-testid="radio" type="radio" />
        <input data-testid="color" type="color" />
        <input data-testid="button" type="button" />
      </Harness>,
    )
    for (const id of ['range', 'checkbox', 'radio', 'color', 'button']) focus(getByTestId(id))
    expect(setOverlayInputFocused).not.toHaveBeenCalledWith(true)
  })

  // Clicking the game blurs the window but leaves document.activeElement on the
  // field (focusout fires with activeElement unchanged), and the view then
  // unmounts while unfocused - no further event. Typing must end with the window.
  it('stops reporting typing when the window loses focus, resumes when it returns', () => {
    const hasFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(true)
    const { getByTestId } = render(
      <Harness>
        <input data-testid="text" type="text" />
      </Harness>,
    )
    focus(getByTestId('text'))
    expect(setOverlayInputFocused.mock.calls).toEqual([[true]])

    hasFocus.mockReturnValue(false)
    act(() => window.dispatchEvent(new Event('blur')))
    expect(setOverlayInputFocused.mock.calls).toEqual([[true], [false]])

    hasFocus.mockReturnValue(true)
    act(() => window.dispatchEvent(new Event('focus')))
    expect(setOverlayInputFocused.mock.calls).toEqual([[true], [false], [true]])
    hasFocus.mockRestore()
  })
})
