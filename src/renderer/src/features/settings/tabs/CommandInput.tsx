import { useEffect, useRef, useState } from 'react'
import { chatCommandScope, scopeAppliesTo } from '../../../../../shared/macro-scope'
import { usePoeVersion } from '../../../shared/poe-version-context'

const POE_COMMANDS: string[] = [
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

export function CommandInput({ value, onChange }: { value: string; onChange: (v: string) => void }): JSX.Element {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const currentGame = usePoeVersion()

  const filtered = POE_COMMANDS.filter(
    (cmd) => scopeAppliesTo(chatCommandScope(cmd), currentGame) && (value ? cmd.includes(value.toLowerCase()) : true),
  )

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
              style={{ color: cmd === value ? 'var(--accent)' : 'var(--text)' }}
            >
              {cmd}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
