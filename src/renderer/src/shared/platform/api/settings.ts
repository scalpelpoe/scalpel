/**
 * Renderer API adapter for settings, profiles, and onboarding.
 *
 * Re-exports the preload bridge's settings/profile methods grouped by domain.
 * Prefer importing from this module in new feature code rather than calling
 * window.api directly -- it documents the settings/profiles surface and keeps
 * the preload bridge shape from leaking into feature components.
 */

import type { AppSettings, RuntimeSettings } from '../../../../../shared/contracts/settings'
import type {
  PoeProfileSummary,
  ProfileSettingKey,
  ProfileSettingValue,
} from '../../../../../shared/contracts/profiles'
import type { GameVariant } from '../../../../../shared/contracts/core'

export function getSettings(): Promise<RuntimeSettings> {
  return window.api.getSettings()
}

export function setSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): Promise<void> {
  return window.api.setSetting(key, value)
}

export function finishOnboarding(): Promise<{ ok: true; restarting?: true; devRestartRequired?: true }> {
  return window.api.finishOnboarding()
}

export function setProfileSettingForGame(
  variant: GameVariant,
  key: ProfileSettingKey,
  value: ProfileSettingValue<typeof key>,
): Promise<RuntimeSettings> {
  return window.api.setProfileSettingForGame(variant, key, value)
}

export function onSettingUpdated(cb: (key: string, value: unknown) => void): () => void {
  return window.api.onSettingUpdated(cb)
}

export function onLeagueUpdated(cb: (league: string) => void): () => void {
  return window.api.onLeagueUpdated(cb)
}

export function setAppWindowMode(mode: 'onboarding' | 'settings'): void {
  window.api.setAppWindowMode(mode)
}

export function openSettingsTab(tab: string): void {
  window.api.openSettingsTab(tab)
}

// ── Profiles ──────────────────────────────────────────────────────────────────

export function listProfiles(): Promise<PoeProfileSummary[]> {
  return window.api.listProfiles()
}

export function createProfile(input: {
  name: string
  gameVariant: GameVariant
  cloneFromId?: string
}): Promise<PoeProfileSummary> {
  return window.api.createProfile(input)
}

export function renameProfile(id: string, name: string): Promise<PoeProfileSummary | null> {
  return window.api.renameProfile(id, name)
}

export function duplicateProfile(id: string, name: string): Promise<PoeProfileSummary> {
  return window.api.duplicateProfile(id, name)
}

export function deleteProfile(id: string): Promise<void> {
  return window.api.deleteProfile(id)
}

export function ensureProfileForGame(variant: GameVariant): Promise<void> {
  return window.api.ensureProfileForGame(variant)
}

export function setActiveProfile(
  id: string,
  restartIfNeeded?: boolean,
): Promise<
  | { ok: true; settings: RuntimeSettings; devRestartRequired?: true }
  | { ok: true; restarting: true; devRestartRequired?: true }
  | { ok: false; requiresRestart: true; targetGame: GameVariant }
  | { ok: false; error: string }
> {
  return window.api.setActiveProfile(id, restartIfNeeded)
}

export function refreshLeagues(): Promise<{ leaguesPoe1: string[]; leaguesPoe2: string[] }> {
  return window.api.refreshLeagues()
}

export function onGameSwitchPrompt(cb: (target: 1 | 2) => void): () => void {
  return window.api.onGameSwitchPrompt(cb)
}

export function respondGameSwitch(choice: 'restart' | 'cancel'): void {
  window.api.respondGameSwitch(choice)
}
