// @vitest-environment jsdom

import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { PluginTabHost } from './PluginTabHost'
import type { RegisteredTab } from './PluginHost'

function makeTab(overlay: RegisteredTab['overlay']): RegisteredTab {
  return {
    pluginId: 'demo',
    label: 'Demo',
    icon: '<svg/>',
    render: () => {},
    overlay,
  }
}

describe('PluginTabHost', () => {
  it('renders the Pop out button for a window-mode overlay', () => {
    const tab = makeTab({ title: 'Demo Overlay', mode: 'window' })
    const { getByText } = render(<PluginTabHost pluginTabs={[tab]} activeId="demo" />)
    expect(getByText('Pop out')).toBeTruthy()
  })

  it('renders the Pop out button when mode is absent (defaults to window)', () => {
    const tab = makeTab({ title: 'Demo Overlay' })
    const { getByText } = render(<PluginTabHost pluginTabs={[tab]} activeId="demo" />)
    expect(getByText('Pop out')).toBeTruthy()
  })

  it('does not render the Pop out button for an annotation-mode overlay', () => {
    const tab = makeTab({ title: 'Demo Overlay', mode: 'annotation' })
    const { queryByText } = render(<PluginTabHost pluginTabs={[tab]} activeId="demo" />)
    expect(queryByText('Pop out')).toBeNull()
  })
})
