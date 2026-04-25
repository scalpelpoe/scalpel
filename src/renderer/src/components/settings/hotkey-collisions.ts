import type { AppSettings } from '../../../../shared/types'

export type HotkeySlot =
  | { kind: 'filter' }
  | { kind: 'pricecheck' }
  | { kind: 'chat'; index: number }
  | { kind: 'appmacro'; index: number }

const slotLabel: Record<string, string> = {
  filter: 'filter',
  pricecheck: 'price check',
  chat: 'macro',
  appmacro: 'app macro',
}

function slotsEqual(a: HotkeySlot, b: HotkeySlot): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === 'chat' && b.kind === 'chat') return a.index === b.index
  if (a.kind === 'appmacro' && b.kind === 'appmacro') return a.index === b.index
  return true
}

/**
 * Find the first slot that already uses the given hotkey, ignoring the slot being edited.
 * Returns null if no collision, otherwise returns the label for a user-facing error message.
 */
export function findHotkeyCollision(settings: AppSettings, hotkey: string, excluding: HotkeySlot): string | null {
  if (!hotkey) return null

  const slots: Array<{ slot: HotkeySlot; value: string }> = [
    { slot: { kind: 'filter' }, value: settings.hotkey ?? '' },
    { slot: { kind: 'pricecheck' }, value: settings.priceCheckHotkey ?? '' },
    ...(settings.chatCommands ?? []).map((c, i) => ({
      slot: { kind: 'chat' as const, index: i },
      value: c.hotkey ?? '',
    })),
    ...(settings.appMacros ?? []).map((m, i) => ({
      slot: { kind: 'appmacro' as const, index: i },
      value: m.hotkey ?? '',
    })),
  ]

  for (const { slot, value } of slots) {
    if (slotsEqual(slot, excluding)) continue
    if (value === hotkey) return slotLabel[slot.kind]
  }
  return null
}
