// @vitest-environment jsdom

// PUBLIC PLUGIN CONTRACT LOCK.
//
// Installed third-party plugins are prebuilt against this exact surface. At
// runtime they import these names from `@scalpelpoe/plugin-sdk` (the host
// serves the bundle as scalpel-internal://sdk.js) and they receive a
// ScalpelPluginContext shaped exactly like the keys below.
//
// REMOVING or RENAMING any entry here breaks every already-installed plugin
// that used it. That is a breaking change: it needs a conscious decision, a
// host major-version bump, and a migration note in the release changelog.
// ADDING an entry is additive and safe - just append it to the list.
//
// This test exists so that breakage is LOUD instead of silent. The other SDK
// tests (runtime.test.tsx, types.test.ts) assert behavior and types of
// individual exports; only this file pins the exact *set*, so a rename or
// deletion fails CI and shows up in the diff as an intentional contract edit
// rather than slipping through with a quietly-updated assertion.
//
// Type-only exports (ScalpelPluginContext, PluginActivate, PluginManifest,
// RegisterTabOptions, PluginStorage, RegisterHotkeyOptions) are erased at
// runtime and are not covered here; they are guarded by types.test.ts and the
// generated rolled-up .d.ts.

import { describe, it, expect } from 'vitest'
import * as SDK from './index'
import { createPluginContext } from '../../renderer/src/plugins/context'
import type { PluginContextFactoryDeps } from '../../renderer/src/plugins/types'

// The exact runtime (value) exports of @scalpelpoe/plugin-sdk, sorted.
const EXPECTED_SDK_EXPORTS = [
  'Button',
  'ErrorBanner',
  'ExternalLinkButton',
  'HotkeyField',
  'HotkeyRecorder',
  'InfoChip',
  'ItemChip',
  'Label',
  'LeagueDropdown',
  'Notice',
  'RARITY_COLORS',
  'RemoveButton',
  'SKILL_GEM_CLASSES',
  'ScrubInput',
  'SettingSelectBox',
  'SettingToggleBox',
  'Slider',
  'TREND_DOWN_COLOR',
  'TREND_THRESHOLD_PCT',
  'TREND_UP_COLOR',
  'TextInput',
  'Textarea',
  'Toggle',
  'compareVersions',
  'defaultPoeItem',
  'deriveItemVariant',
  'externalLinkUrl',
  'findRelated',
  'formatDust',
  'formatPrice',
  'getDustInfo',
  'getGameFeatures',
  'getItemIcon',
  'getTrendDirection',
  'isClusterJewel',
  'isSkillGem',
  'isTownOrHideout',
  'keyEventToAccelerator',
  'ninjaLeagueSegment',
  'ninjaLinkUrl',
  'prettyHotkey',
  'useCurrentZone',
  'versionMatches',
].sort()

// The exact keys of the object a plugin receives as its ScalpelPluginContext,
// sorted. This pins the runtime shape produced by createPluginContext, which
// is what a running plugin actually touches (the type side is in types.ts /
// types.test.ts; this catches implementation drift away from that type).
const EXPECTED_CONTEXT_KEYS = [
  'copyAndEvaluateItem',
  'fetch',
  'getCurrentItem',
  'getCurrentZone',
  'getLeague',
  'getPoeVersion',
  'log',
  'onCurrentItem',
  'onCurrentZone',
  'onLeagueChange',
  'openExternal',
  'openTab',
  'pluginId',
  'pluginVersion',
  'registerHotkey',
  'registerTab',
  'storage',
].sort()

function stubDeps(): PluginContextFactoryDeps {
  const unsubscribe = (): void => {}
  return {
    pluginId: 'surface-test',
    pluginVersion: '0.0.0',
    getPoeVersion: () => 1,
    getLeague: () => '',
    getCurrentItem: () => null,
    getCurrentZone: () => null,
    subscribeCurrentItem: () => unsubscribe,
    subscribeCurrentZone: () => unsubscribe,
    subscribeLeagueChange: () => unsubscribe,
    openExternal: () => {},
    storage: {
      get: async () => null,
      set: async () => {},
      delete: async () => {},
      keys: async () => [],
    },
    registerTab: () => {},
    registerHotkey: () => {},
    openTab: () => {},
    copyAndEvaluateItem: async () => null,
  }
}

describe('plugin public contract', () => {
  it('SDK exports exactly the locked runtime surface', () => {
    expect(Object.keys(SDK).sort()).toEqual(EXPECTED_SDK_EXPORTS)
  })

  it('every locked SDK export resolves (not a missing-externalization stub)', () => {
    for (const name of EXPECTED_SDK_EXPORTS) {
      expect((SDK as Record<string, unknown>)[name], `SDK.${name} is undefined`).toBeDefined()
    }
  })

  it('ScalpelPluginContext exposes exactly the locked keys', () => {
    const ctx = createPluginContext(stubDeps())
    expect(Object.keys(ctx).sort()).toEqual(EXPECTED_CONTEXT_KEYS)
  })
})
