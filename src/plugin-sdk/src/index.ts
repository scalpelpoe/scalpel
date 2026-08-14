// Public entry for the Scalpel plugin SDK.
// Stable surface - treat additions as additive only.
//
// The triple-slash reference pulls in an ambient declaration of the
// `window.api` subset the SDK depends on, so downstream consumers don't see
// type errors in HotkeyField / HotkeyRecorder / useCurrentZone.
/// <reference path="./globals.d.ts" />

export * from './runtime'
export type {
  MediaApi,
  MediaSession,
  PluginActivate,
  PluginApiClient,
  PluginApiHandler,
  PluginCommunicationApi,
  PluginDependency,
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
