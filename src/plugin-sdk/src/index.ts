// Public entry for the Scalpel plugin SDK.
// Stable surface - treat additions as additive only.
//
// The triple-slash reference pulls in an ambient declaration of the
// `window.api` subset the SDK depends on, so downstream consumers don't see
// type errors in HotkeyField / HotkeyRecorder / useCurrentZone.
/// <reference path="./globals.d.ts" />

export * from './runtime'
export type {
  FilterApi,
  FilterBaseTypeMove,
  FilterMoveRequest,
  FilterMoveResult,
  FilterMoveSkip,
  LoadedFilter,
  MediaApi,
  MediaSession,
  PluginActivate,
  PluginManifest,
  PluginStorage,
  PluginTeardown,
  PriceEntry,
  PricesApi,
  RegisterHotkeyOptions,
  RegisterOverlayOptions,
  RegisterTabOptions,
  ScalpelPluginContext,
} from './types'
