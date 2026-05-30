import { describe, expect, it, vi } from 'vitest'
import {
  applyRegexPreset,
  bottomLeftSnapTarget,
  leftDockFracX,
  regexRemoteAnchor,
  type RegexRemoteApplyDeps,
} from './regex-remote'
import type { RegexPreset } from '../shared/types'
import { POE_SIDEBAR_RATIO } from '../shared/poe-geometry'

vi.mock('./windowing', () => ({ registerSecondaryOverlay: vi.fn() }))

function preset(over: Partial<RegexPreset>): RegexPreset {
  return {
    id: 'p1',
    generator: 'maps',
    tags: [],
    avoid: [],
    want: [],
    wantMode: 'any',
    qualifiers: {},
    nightmare: false,
    regex: 'abc',
    ...over,
  } as RegexPreset
}

function deps(over: Partial<RegexRemoteApplyDeps> = {}): {
  d: RegexRemoteApplyDeps
  focus: ReturnType<typeof vi.fn>
  paste: ReturnType<typeof vi.fn>
} {
  const focus = vi.fn()
  const paste = vi.fn()
  const d: RegexRemoteApplyDeps = {
    getPresets: () => [preset({ id: 'p1', regex: 'aaa' }), preset({ id: 'p2', regex: 'bbb' })],
    focusGame: focus,
    paste,
    defer: (fn) => fn(),
    ...over,
  }
  return { d, focus, paste }
}

describe('applyRegexPreset', () => {
  it('focuses the game then pastes the matching preset regex', () => {
    const { d, focus, paste } = deps()
    applyRegexPreset('p2', d)
    expect(focus).toHaveBeenCalledOnce()
    expect(paste).toHaveBeenCalledWith('bbb')
  })

  it('no-ops on an unknown preset id', () => {
    const { d, focus, paste } = deps()
    applyRegexPreset('nope', d)
    expect(focus).not.toHaveBeenCalled()
    expect(paste).not.toHaveBeenCalled()
  })

  it('no-ops when the matched preset has an empty regex', () => {
    const { d, focus, paste } = deps({
      getPresets: () => [preset({ id: 'p1', regex: '' })],
    })
    applyRegexPreset('p1', d)
    expect(focus).not.toHaveBeenCalled()
    expect(paste).not.toHaveBeenCalled()
  })
})

describe('leftDockFracX', () => {
  it('docks at the sidebar edge as a fraction of width (16:9)', () => {
    expect(leftDockFracX({ width: 1920, height: 1080 })).toBeCloseTo((1080 * POE_SIDEBAR_RATIO) / 1920)
  })
  it('is aspect-independent (computed from actual bounds)', () => {
    expect(leftDockFracX({ width: 2560, height: 1080 })).toBeCloseTo((1080 * POE_SIDEBAR_RATIO) / 2560)
  })
  it('falls back to a 16:9 estimate when bounds are missing or empty', () => {
    const expected = POE_SIDEBAR_RATIO / (16 / 9)
    expect(leftDockFracX(null)).toBeCloseTo(expected)
    expect(leftDockFracX(undefined)).toBeCloseTo(expected)
    expect(leftDockFracX({ width: 0, height: 0 })).toBeCloseTo(expected)
  })
})

describe('bottomLeftSnapTarget', () => {
  it('pins the bottom-left corner, growing upward when the window is taller', () => {
    const dock = { x: 100, y: 200, width: 160, height: 400 } // bottom = 600
    expect(bottomLeftSnapTarget(dock, { x: 0, y: 0, width: 180, height: 500 })).toEqual({
      x: 100,
      y: 100, // 200 + 400 - 500, so bottom stays 600
      width: 180,
      height: 500,
    })
  })
  it('keeps the left edge at the dock x regardless of the current position', () => {
    const dock = { x: 100, y: 200, width: 160, height: 400 }
    const t = bottomLeftSnapTarget(dock, { x: 999, y: 999, width: 160, height: 400 })
    expect(t.x).toBe(100)
    expect(t.y).toBe(200) // same size -> unchanged top
  })
})

describe('regexRemoteAnchor', () => {
  const tb = { width: 1920, height: 1080 }
  it('docks at the stash sidebar when the stash (left panel) is detected open', () => {
    const a = regexRemoteAnchor({ leftPanelOpen: true, rightPanelOpen: true }, tb)
    expect(a.fracX).toBeCloseTo((1080 * POE_SIDEBAR_RATIO) / 1920)
  })
  it('docks further right (vendor) when the left panel is not detected', () => {
    const stashX = (1080 * POE_SIDEBAR_RATIO) / 1920
    const a = regexRemoteAnchor({ leftPanelOpen: false, rightPanelOpen: true }, tb)
    expect(a.fracX).toBeGreaterThan(stashX)
  })
  it('pins the stash dock to the XP bar but sits the vendor dock higher', () => {
    const stash = regexRemoteAnchor({ leftPanelOpen: true, rightPanelOpen: true }, tb)
    const vendor = regexRemoteAnchor({ leftPanelOpen: false, rightPanelOpen: true }, tb)
    expect(stash.fracY + stash.fracH).toBeCloseTo(0.95)
    expect(vendor.fracY).toBeLessThan(stash.fracY)
  })
})
