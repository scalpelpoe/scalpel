import { useEffect, useRef, useState } from 'react'
import type { AppSettings } from '../../../../shared/types'
import { Toggle } from '../Toggle'
import { FilterPicker } from '../FilterPicker'
import { keyEventToAccelerator, prettyHotkey } from './utils'

interface Props {
  settings: AppSettings
  update: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
  isOverlay: boolean
  onOnlineFilterUpdated?: (name: string) => void
  onOnlineImport?: (name: string) => void
  onSettingsChange: (s: AppSettings) => void
  tryHotkey: (hotkey: string, slot: { kind: 'filter' }) => boolean
}

export function FilterTab({
  settings,
  update,
  isOverlay,
  onOnlineFilterUpdated,
  onOnlineImport,
  onSettingsChange,
  tryHotkey,
}: Props): JSX.Element {
  const [recording, setRecording] = useState(false)
  const recRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!recording) return
    window.api.suspendHotkeys()
    const onKey = (e: KeyboardEvent): void => {
      e.preventDefault()
      e.stopPropagation()
      const acc = keyEventToAccelerator(e)
      if (!acc) return
      if (!tryHotkey(acc, { kind: 'filter' })) {
        setRecording(false)
        return
      }
      update('hotkey', acc)
      setRecording(false)
    }
    const onClick = (e: MouseEvent): void => {
      if (recRef.current && !recRef.current.contains(e.target as Node)) setRecording(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onClick)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onClick)
      window.api.resumeHotkeys()
    }
  }, [recording, update, tryHotkey])

  return (
    <>
      {/* Filter folder & picker */}
      <section>
        <label>Filter folder</label>
        <div className="mt-[6px]">
          <FilterPicker
            settings={settings}
            onSettingsChange={onSettingsChange}
            autoSwitchInGame={isOverlay || undefined}
            onOnlineFilterUpdated={onOnlineFilterUpdated}
            onOnlineImport={onOnlineImport}
          />
        </div>
        {isOverlay && !settings.filterPath && (
          <p className="text-[11px] text-text-dim mt-1">
            Typically: <code>Documents\My Games\Path of Exile</code>
          </p>
        )}
      </section>

      {/* Filter hotkey */}
      <section>
        <label>Filter hotkey</label>
        <div ref={recRef} className="mt-[6px]">
          <div className="setting-box" onClick={() => setRecording(true)}>
            <span className={`value ${recording ? 'recording' : ''}`}>
              {recording ? 'Press your desired key combo...' : prettyHotkey(settings.hotkey) || '(none set)'}
            </span>
            {!recording && (
              <button
                className="primary"
                onClick={(e) => {
                  e.stopPropagation()
                  setRecording(true)
                }}
              >
                Change
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Reload on save */}
      <section>
        <div
          onClick={() => update('reloadOnSave', !settings.reloadOnSave)}
          className="flex items-center gap-[10px] cursor-pointer select-none"
        >
          <Toggle checked={settings.reloadOnSave} onChange={(val) => update('reloadOnSave', val)} />
          <span className="text-xs text-text">Automatically reload filter when switching an item's tier</span>
        </div>
      </section>
    </>
  )
}
