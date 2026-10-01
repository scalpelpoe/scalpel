// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { sampleSnapshot } from '../test-helpers'
import { CompactGear } from './CompactGear'

describe('CompactGear price check', () => {
  it('opens the checker from an expanded card and goes back', () => {
    const snapshot = sampleSnapshot()
    const helm = snapshot.equipment.Helm
    if (!helm) throw new Error('sample has no helm')
    helm.priceCheck = {
      league: 'Fate of the Vaal',
      body: { query: { stats: [{ type: 'and', filters: [{ id: 'explicit.stat_life', value: { min: 72 } }] }] } },
      rows: [
        {
          id: 'explicit.stat_life',
          text: '+72 to maximum Life',
          type: 'explicit',
          value: 72,
          min: 72,
          max: null,
          defaultEnabled: true,
          locked: false,
          offOps: [{ op: 'disable', path: ['query', 'stats', 0, 'filters', 0] }],
          minPath: ['query', 'stats', 0, 'filters', 0, 'value', 'min'],
          maxPath: ['query', 'stats', 0, 'filters', 0, 'value', 'max'],
        },
      ],
    }
    render(<CompactGear snapshot={snapshot} />)
    fireEvent.click(screen.getByRole('button', { name: /Grim Veil/ }))
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Price check' }))
    expect(screen.getByRole('link', { name: /Search on trade/ })).toBeInTheDocument()
    expect(screen.queryByRole('tooltip')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Back to item' }))
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
  })
})
