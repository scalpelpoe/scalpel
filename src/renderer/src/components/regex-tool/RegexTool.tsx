import { RegexGenerator } from './RegexGenerator'
import type { AppSettings, RuntimeSettings } from '../../../../shared/types'
import type { HotkeySlot } from '../settings/hotkey-collisions'

interface Props {
  settings: RuntimeSettings
  update: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
  tryHotkey: (hotkey: string, slot: HotkeySlot) => boolean
}

export function RegexTool({ settings, update, tryHotkey }: Props): JSX.Element {
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <RegexGenerator settings={settings} update={update} tryHotkey={tryHotkey} />
    </div>
  )
}
