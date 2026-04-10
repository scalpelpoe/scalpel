import { useEffect, useRef, useState } from 'react'
import type { AppSettings } from '../../../shared/types'
import { CHANGELOG } from '../../../shared/changelog'
import { Toggle } from './Toggle'
import { FilterPicker } from './FilterPicker'
import { Down, Right, CloseSmall } from '@icon-park/react'
import { IP } from '../shared/constants'

export function keyEventToAccelerator(e: KeyboardEvent): string | null {
  const KEY_MAP: Record<string, string> = {
    Control: '',
    Meta: '',
    Alt: '',
    Shift: '',
    ' ': 'Space',
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    Escape: 'Escape',
    Enter: 'Return',
    Backspace: 'Backspace',
    Delete: 'Delete',
    Tab: 'Tab',
    Home: 'Home',
    End: 'End',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
    Insert: 'Insert',
  }
  if (['Control', 'Meta', 'Alt', 'Shift'].includes(e.key)) return null
  const parts: string[] = []
  if (e.ctrlKey || e.metaKey) parts.push('CommandOrControl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  const key = KEY_MAP[e.key] ?? (e.key.length === 1 ? e.key.toUpperCase() : e.key)
  parts.push(key)
  return parts.join('+')
}

interface Props {
  settings: AppSettings
  onSettingsChange: (s: AppSettings) => void
  /** 'overlay' hides app-only settings, wraps in a card, shows descriptions */
  mode: 'overlay' | 'app'
  onDone?: () => void
  onOnlineFilterUpdated?: (name: string) => void
  onOnlineImport?: (name: string) => void
  onShowOnboarding?: () => void
}

export function SettingsPanel({
  settings,
  onSettingsChange,
  mode,
  onDone: _onDone,
  onOnlineFilterUpdated,
  onOnlineImport,
  onShowOnboarding,
}: Props): JSX.Element {
  const [recording, setRecording] = useState<'hotkey' | 'priceCheckHotkey' | null>(null)
  const [changelogOpen, setChangelogOpen] = useState(false)
  const [showFaq, setShowFaq] = useState(false)
  const recRef = useRef<HTMLDivElement>(null)

  const update = <K extends keyof AppSettings>(key: K, value: AppSettings[K]): void => {
    window.api.setSetting(key, value)
    onSettingsChange({ ...settings, [key]: value })
  }

  useEffect(() => {
    if (!recording) return
    const handler = (e: KeyboardEvent): void => {
      e.preventDefault()
      e.stopPropagation()
      const acc = keyEventToAccelerator(e)
      if (!acc) return
      update(recording, acc)
      setRecording(null)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [recording, settings, onSettingsChange])

  useEffect(() => {
    if (!recording) return
    const handler = (e: MouseEvent): void => {
      if (recRef.current && !recRef.current.contains(e.target as Node)) setRecording(null)
    }
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [recording])

  const isOverlay = mode === 'overlay'

  return (
    <div className={`flex flex-col ${isOverlay ? 'gap-5 bg-bg-card rounded p-4 pb-5' : 'gap-6 pb-[18px]'}`}>
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <h2
            className="section-title"
            style={!isOverlay ? { color: 'var(--accent)', fontSize: 16, fontWeight: 700 } : undefined}
          >
            {showFaq ? 'FAQ' : 'Settings'}
          </h2>
          {!showFaq && <span className="text-[9px] text-accent opacity-60">Beta {__APP_VERSION__}</span>}
        </div>
        <div className="flex gap-[6px]">
          {!showFaq && (
            <button onClick={() => setShowFaq(true)} className="text-[11px] text-text-dim px-3 py-1.5">
              FAQ
            </button>
          )}
          {showFaq && (
            <button onClick={() => setShowFaq(false)} className="text-[11px] text-text-dim px-3 py-1.5">
              Settings
            </button>
          )}
          {!isOverlay && !showFaq && onShowOnboarding && (
            <button onClick={onShowOnboarding} className="text-[11px] text-text-dim px-3 py-1.5">
              Setup Wizard
            </button>
          )}
        </div>
      </div>

      {showFaq && (
        <div className="mt-3 flex flex-col gap-3">
          <div className="text-[10px] text-accent tracking-[1.5px] uppercase font-bold">General Questions</div>
          <FaqItem
            q="Is Scalpel compatible with GGG's Terms of Service?"
            a="Scalpel is an overlay that runs alongside PoE, not inside it. The only things it does to the game are: send a copy-to-clipboard request when you press the hotkey, edit your .filter file on disk, send /reloaditemfilter or /itemfilter commands when saving changes, and send whatever chat commands you bind in settings. It does not inject into the game, read game memory, or automate gameplay."
          />
          <FaqItem q="POE2 When" a="Stay tuned. I want to have it ready for 0.5" />

          <div className="text-[10px] text-accent tracking-[1.5px] uppercase font-bold mt-1">Something Broke</div>
          <FaqItem
            q="Scalpel doesn't detect my items / hotkey doesn't work"
            a="If you run Path of Exile in elevated admin mode, you need to run Scalpel as administrator too. Right-click Scalpel.exe and select 'Run as administrator'."
          />
          <FaqItem
            q="The overlay doesn't appear over my game"
            a="Scalpel only works in Borderless Windowed or Windowed mode. Fullscreen is not supported. You can change this in PoE's graphics settings."
          />
          <FaqItem
            q="I updated my filter online but Scalpel doesn't see the changes"
            a="Click 'Check for Filter Updates' in the overlay header. This tells PoE to re-download the online filter, then Scalpel detects the change."
          />
          <FaqItem
            q="My filter changes were lost after updating"
            a="Starting from v0.7.4, Scalpel records your changes and replays them when you update. If you were on an older version, your first update after upgrading will reset your filter to the online version. Changes made after that are preserved."
          />
          <FaqItem
            q="The 'Go to Hideout' button stopped working"
            a="The trade site login session expires after a while. Go to Settings > Trade site login and log in again to refresh it."
          />

          <div className="text-[10px] text-accent tracking-[1.5px] uppercase font-bold mt-1">Tips & Tricks</div>
          <FaqItem
            q="How do I use custom sound packs?"
            a="Drop your .mp3 files into your filter folder (Documents/My Games/Path of Exile). They'll appear in the sound dropdown alongside built-in sounds when editing a filter block."
          />
        </div>
      )}

      {!showFaq && (
        <>
          {/* General */}
          <div className="text-[10px] text-accent tracking-[1.5px] uppercase mt-3 font-bold">General</div>

          {/* League */}
          <section>
            <label>League</label>
            <div className="setting-box mt-[6px] relative">
              <span className="value">{settings.league}</span>
              <button
                className="primary"
                onClick={() => {
                  const sel = document.getElementById('league-select-unified') as HTMLSelectElement | null
                  sel?.showPicker?.()
                  sel?.focus()
                }}
              >
                Change
              </button>
              <select
                id="league-select-unified"
                value={settings.league}
                onChange={(e) => update('league', e.target.value)}
                className="absolute inset-0 opacity-0 cursor-pointer"
              >
                {['Mirage', 'Hardcore Mirage', 'Standard', 'Hardcore'].map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
          </section>

          {/* Overlay scale */}
          <section>
            <label>Overlay scale</label>
            <div className="flex items-center gap-3 mt-[6px]">
              <input
                type="range"
                min="0.5"
                max="2"
                step="0.05"
                value={settings.overlayScale}
                onChange={(e) => update('overlayScale', parseFloat(e.target.value))}
                className="flex-1"
              />
              <span className="text-xs text-text font-mono min-w-[36px] text-right">
                {Math.round(settings.overlayScale * 100)}%
              </span>
            </div>
          </section>

          {/* Close on click outside */}
          <section>
            <div
              onClick={() => update('closeOnClickOutside', !settings.closeOnClickOutside)}
              className="flex items-center gap-[10px] cursor-pointer select-none"
            >
              <Toggle checked={settings.closeOnClickOutside} onChange={(val) => update('closeOnClickOutside', val)} />
              <span className="text-xs text-text">Close overlay when clicking outside</span>
            </div>
          </section>

          {/* Stash tab scrolling */}
          <section>
            <div
              onClick={() => update('stashScrollEnabled', !settings.stashScrollEnabled)}
              className="flex items-center gap-[10px] cursor-pointer select-none"
            >
              <Toggle
                checked={settings.stashScrollEnabled ?? false}
                onChange={(val) => update('stashScrollEnabled', val)}
              />
              <span className="text-xs text-text">Stash tab scrolling (Ctrl + Scroll Wheel)</span>
            </div>
          </section>

          {/* Chat Commands */}
          <div className="text-[10px] text-accent tracking-[1.5px] uppercase mt-3 font-bold">Chat Commands</div>
          <section>
            <div className="flex flex-col gap-[6px]">
              {(settings.chatCommands ?? []).map((cmd, i) => (
                <div key={i} className="flex gap-[6px] items-center">
                  <HotkeyRecorder
                    value={cmd.hotkey}
                    onChange={(hotkey) => {
                      const cmds = [...(settings.chatCommands ?? [])]
                      cmds[i] = { ...cmds[i], hotkey }
                      update('chatCommands', cmds)
                    }}
                  />
                  <CommandInput
                    value={cmd.command}
                    onChange={(val) => {
                      const cmds = [...(settings.chatCommands ?? [])]
                      cmds[i] = { ...cmds[i], command: val }
                      update('chatCommands', cmds)
                    }}
                  />
                  <div
                    onClick={() => {
                      const cmds = (settings.chatCommands ?? []).filter((_, j) => j !== i)
                      update('chatCommands', cmds)
                    }}
                    className="shrink-0 cursor-pointer text-text-dim flex items-center p-1"
                  >
                    <CloseSmall size={14} {...IP} />
                  </div>
                </div>
              ))}
              <button
                onClick={() => {
                  const cmds = [...(settings.chatCommands ?? []), { hotkey: '', command: '' }]
                  update('chatCommands', cmds)
                }}
                className="text-[11px] text-text-dim self-start px-3 py-1.5"
              >
                + Add Command
              </button>
            </div>
          </section>

          {/* Filter */}
          <div className="text-[10px] text-accent tracking-[1.5px] uppercase mt-3 font-bold">Filter</div>

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
              <div className="setting-box" onClick={() => setRecording('hotkey')}>
                <span className={`value ${recording === 'hotkey' ? 'recording' : ''}`}>
                  {recording === 'hotkey' ? 'Press your desired key combo...' : settings.hotkey || '(none set)'}
                </span>
                {recording !== 'hotkey' && (
                  <button
                    className="primary"
                    onClick={(e) => {
                      e.stopPropagation()
                      setRecording('hotkey')
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

          {/* Price Check */}
          <div className="text-[10px] text-accent tracking-[1.5px] uppercase mt-3 font-bold">Price Check</div>

          {/* Price check hotkey */}
          <section>
            <label>Price check hotkey</label>
            <div className="mt-[6px]">
              <div className="setting-box" onClick={() => setRecording('priceCheckHotkey')}>
                <span className={`value ${recording === 'priceCheckHotkey' ? 'recording' : ''}`}>
                  {recording === 'priceCheckHotkey'
                    ? 'Press your desired key combo...'
                    : settings.priceCheckHotkey || '(none set)'}
                </span>
                {recording !== 'priceCheckHotkey' && (
                  <button
                    className="primary"
                    onClick={(e) => {
                      e.stopPropagation()
                      setRecording('priceCheckHotkey')
                    }}
                  >
                    Change
                  </button>
                )}
              </div>
            </div>
          </section>

          {/* Trade listing type */}
          <section>
            <label>Trade listings</label>
            <div className="setting-box mt-[6px] relative">
              <span className="value">
                {settings.tradeStatus === 'securable' ? 'Instant buyout only' : 'All listings'}
              </span>
              <button
                className="primary"
                onClick={() => {
                  const sel = document.getElementById('trade-status-select') as HTMLSelectElement | null
                  sel?.showPicker?.()
                  sel?.focus()
                }}
              >
                Change
              </button>
              <select
                id="trade-status-select"
                value={settings.tradeStatus}
                onChange={(e) => update('tradeStatus', e.target.value as 'available' | 'securable')}
                className="absolute inset-0 opacity-0 cursor-pointer"
              >
                <option value="available">All listings</option>
                <option value="securable">Instant buyout only</option>
              </select>
            </div>
          </section>

          {/* Price display */}
          <section>
            <label>Buyout price currency</label>
            <div className="setting-box mt-[6px] relative">
              <span className="value">
                {(settings.tradePriceOption ?? 'chaos_divine') === 'chaos_divine'
                  ? 'Chaos or Divine Orbs'
                  : 'Chaos Orb equivalent'}
              </span>
              <button
                className="primary"
                onClick={() => {
                  const sel = document.getElementById('trade-price-select') as HTMLSelectElement | null
                  sel?.showPicker?.()
                  sel?.focus()
                }}
              >
                Change
              </button>
              <select
                id="trade-price-select"
                value={settings.tradePriceOption ?? 'chaos_divine'}
                onChange={(e) => update('tradePriceOption', e.target.value as 'chaos_divine' | 'chaos_equivalent')}
                className="absolute inset-0 opacity-0 cursor-pointer"
              >
                <option value="chaos_divine">Chaos or Divine Orbs</option>
                <option value="chaos_equivalent">Chaos Orb equivalent</option>
              </select>
            </div>
          </section>

          <section>
            <label>Default search percentage</label>
            <div className="flex items-center gap-[10px] mt-1">
              <input
                type="range"
                min={50}
                max={100}
                step={5}
                value={settings.priceCheckDefaultPercent ?? 90}
                onChange={(e) => update('priceCheckDefaultPercent', parseInt(e.target.value))}
                className="flex-1"
              />
              <span className="text-[13px] font-semibold text-text min-w-[36px] text-right">
                {settings.priceCheckDefaultPercent ?? 90}%
              </span>
            </div>
          </section>

          {/* Trade site login */}
          <section>
            <label>Trade site login</label>
            <div className="mt-[6px]">
              <PoeLoginButton />
            </div>
          </section>

          {/* Changelog */}
          <section>
            <div
              onClick={() => setChangelogOpen(!changelogOpen)}
              className="flex items-center gap-[6px] cursor-pointer select-none"
            >
              {changelogOpen ? <Down size={12} {...IP} /> : <Right size={12} {...IP} />}
              <span className="text-xs text-text-dim">Changelog</span>
            </div>
            {changelogOpen && (
              <div className="mt-2 flex flex-col gap-[10px]">
                {CHANGELOG.map((entry) => (
                  <div key={entry.version}>
                    <div className="text-[11px] font-semibold text-accent">v{entry.version}</div>
                    <ul className="mt-1 ml-4 p-0 text-[11px] text-text-dim">
                      {entry.notes.map((note, i) => (
                        <li key={i} className="mt-0.5">
                          {note}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}

function HotkeyRecorder({ value, onChange }: { value: string; onChange: (v: string) => void }): JSX.Element {
  const [listening, setListening] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!listening) return
    const onKey = (e: KeyboardEvent): void => {
      e.preventDefault()
      e.stopPropagation()
      const acc = keyEventToAccelerator(e)
      if (!acc) return
      onChange(acc)
      setListening(false)
    }
    const onClick = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setListening(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onClick)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onClick)
    }
  }, [listening, onChange])

  return (
    <div ref={ref} className="setting-box flex-1 cursor-pointer h-[34px] box-border" onClick={() => setListening(true)}>
      <span className={`value ${listening ? 'recording' : ''}`}>
        {listening ? 'Press your key combo...' : value || '(none set)'}
      </span>
    </div>
  )
}

const POE_COMMANDS = [
  '/hideout',
  '/menagerie',
  '/delve',
  '/kingsmarch',
  '/monastery',
  '/reloaditemfilter',
  '/remaining',
  '/passives',
  '/played',
  '/age',
  '/deaths',
  '/ladder',
  '/pvp',
  '/itemlevel',
  '/reset_xp',
  '/exit',
  '/oos',
  '/cls',
  '/dance',
  '/save_hideout',
  '/destroy',
  '/afk',
  '/dnd',
  '/autoreply',
  '@last',
]

function CommandInput({ value, onChange }: { value: string; onChange: (v: string) => void }): JSX.Element {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const filtered = value ? POE_COMMANDS.filter((c) => c.includes(value.toLowerCase())) : POE_COMMANDS

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className="flex-1 relative">
      <input
        type="text"
        value={value}
        placeholder="/hideout"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
        }}
        className="w-full text-xs font-mono h-[34px] box-border px-3 py-2 bg-black/30"
      />
      {open && filtered.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-0.5 bg-bg-card border border-border rounded max-h-[150px] overflow-y-auto z-10">
          {filtered.map((cmd) => (
            <div
              key={cmd}
              onClick={() => {
                onChange(cmd)
                setOpen(false)
              }}
              className="text-[11px] font-mono cursor-pointer px-3 py-[5px] hover:bg-white/5 transition-colors"
              style={{
                color: cmd === value ? 'var(--accent)' : 'var(--text)',
              }}
            >
              {cmd}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function FaqItem({ q, a }: { q: string; a: string }): JSX.Element {
  return (
    <div className="rounded-[6px] border border-border px-3 py-[10px] bg-black/20">
      <div className="text-xs font-semibold text-text mb-[6px]">{q}</div>
      <div className="text-[11px] text-text-dim leading-normal">{a}</div>
    </div>
  )
}

function PoeLoginButton(): JSX.Element {
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null)

  const checkAuth = (): void => {
    window.api.poeCheckAuth().then((r) => setLoggedIn(r.loggedIn))
  }

  useEffect(() => {
    checkAuth()
  }, [])

  if (loggedIn === null) return <span className="text-[11px] text-text-dim">Checking...</span>

  if (loggedIn) {
    return (
      <div className="setting-box">
        <span className="value text-accent">Logged in</span>
        <button
          className="primary"
          onClick={() => {
            window.api.poeLogout().then(() => setLoggedIn(false))
          }}
        >
          Logout
        </button>
      </div>
    )
  }

  return (
    <div className="setting-box">
      <span className="value text-text-dim">Not logged in</span>
      <button
        className="primary"
        onClick={() => {
          window.api.poeLogin().then(() => {
            setTimeout(checkAuth, 2000)
          })
        }}
      >
        Login
      </button>
    </div>
  )
}
