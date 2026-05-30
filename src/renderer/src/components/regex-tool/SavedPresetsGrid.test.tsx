// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SavedPresetsGrid } from './SavedPresetsGrid'
import type { RegexPreset } from '../../../../shared/types'

const p = (id: string, name: string, color?: string): RegexPreset => ({
  id,
  name,
  color,
  generator: 'maps',
  avoid: [],
  want: [],
  wantMode: 'any',
  qualifiers: {},
  nightmare: false,
  regex: '',
})

describe('SavedPresetsGrid', () => {
  it('renders boxes newest-first and loads on click', () => {
    const onLoad = vi.fn()
    render(
      <SavedPresetsGrid
        presets={[p('a', 'First'), p('b', 'Second')]}
        generator="maps"
        loadPreset={onLoad}
        deletePreset={vi.fn()}
        boundHotkeyFor={() => undefined}
      />,
    )
    const boxes = screen.getAllByRole('button', { name: /First|Second/ })
    expect(boxes[0]).toHaveTextContent('Second') // newest (last in array) first
    fireEvent.click(screen.getByRole('button', { name: /First/ }))
    expect(onLoad).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }))
  })

  it('filters by generator', () => {
    render(
      <SavedPresetsGrid
        presets={[p('a', 'MapPreset'), { ...p('b', 'CustomPreset'), generator: 'custom' }]}
        generator="maps"
        loadPreset={vi.fn()}
        deletePreset={vi.fn()}
        boundHotkeyFor={() => undefined}
      />,
    )
    expect(screen.queryByText('CustomPreset')).toBeNull()
    expect(screen.getByText('MapPreset')).toBeTruthy()
  })
})
