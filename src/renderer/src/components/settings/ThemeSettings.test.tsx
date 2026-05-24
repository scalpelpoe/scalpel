// @vitest-environment jsdom
import { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AppSettings } from '../../../../shared/types'
import { DEFAULT_PALETTE } from '../../../../shared/theme/presets'
import { ThemeSettings } from './ThemeSettings'
import { applyPalette, applyVars } from '../../shared/apply-theme'

vi.mock('../../shared/apply-theme', () => ({ applyPalette: vi.fn(), applyVars: vi.fn() }))

const mockApply = vi.mocked(applyPalette)
const mockApplyVars = vi.mocked(applyVars)

beforeEach(() => {
  mockApply.mockClear()
  mockApplyVars.mockClear()
})

// Mirrors SettingsPanel's update/updateMany wiring: both spread the render-closure
// `settings` and call setSettings, exactly as SettingsPanel does.
function Harness(): JSX.Element {
  const [settings, setSettings] = useState<AppSettings>({
    themeId: 'default',
    customThemePalette: null,
  } as unknown as AppSettings)
  const update = <K extends keyof AppSettings>(key: K, value: AppSettings[K]): void => {
    setSettings({ ...settings, [key]: value })
  }
  const updateMany = (patch: Partial<AppSettings>): void => {
    setSettings({ ...settings, ...patch })
  }
  return <ThemeSettings settings={settings} update={update} updateMany={updateMany} />
}

function colorInput(label: string): HTMLInputElement {
  const span = screen.getByText(label)
  const el = span.closest('label')!.querySelector('input[type="color"]')
  return el as HTMLInputElement
}

describe('ThemeSettings custom save sequence', () => {
  it('keeps prior custom edits after save when a second color is changed (no reset to default)', () => {
    render(<Harness />)

    // Open the collapsible Customize section.
    fireEvent.click(screen.getByText('Customize'))

    // First customization.
    fireEvent.change(colorInput('Accent'), { target: { value: '#111111' } })
    // Save the custom theme.
    fireEvent.click(screen.getByText('Save custom theme'))
    // Second customization.
    fireEvent.change(colorInput('Background'), { target: { value: '#222222' } })

    // The last live-preview call must carry the saved custom palette plus BOTH edits,
    // i.e. it must NOT have reverted accent back to the default palette value.
    const lastArg = mockApplyVars.mock.calls[mockApplyVars.mock.calls.length - 1]?.[0]
    expect(lastArg).toEqual({ ...DEFAULT_PALETTE, accent: '#111111', bgSolid: '#222222' })
  })

  it('shows a single selected "Custom" preset chip after saving a custom theme', () => {
    render(<Harness />)
    fireEvent.click(screen.getByText('Customize'))
    fireEvent.change(colorInput('Accent'), { target: { value: '#abcdef' } })
    fireEvent.click(screen.getByText('Save custom theme'))

    // Exactly one "Custom" chip, and it is the selected preset (bg-accent class).
    const customChips = screen.getAllByRole('button', { name: /Custom/ }).filter((b) => b.textContent === 'Custom')
    expect(customChips).toHaveLength(1)
    expect(customChips[0].className).toContain('bg-accent')

    // Saving again (no new edits) must not create a second "Custom" chip.
    // The Customize section stayed open after the first save (CollapsibleSection
    // was already open), so we do not re-click "Customize" - just edit directly.
    fireEvent.change(colorInput('Background'), { target: { value: '#123456' } })
    fireEvent.click(screen.getByText('Save custom theme'))
    const after = screen.getAllByRole('button', { name: /Custom/ }).filter((b) => b.textContent === 'Custom')
    expect(after).toHaveLength(1)
  })
})
