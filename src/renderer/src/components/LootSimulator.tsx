import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FilterSection, LootSimDrop, LootSimPoolItem } from '@shared/types'
import { HiddenLootLabel, LootLabel } from '@renderer/shared/LootLabel'

interface Props {
  filterPath?: string | null
}

async function playDropAlert(drop: LootSimDrop, volume: number, filterDir: string | null): Promise<void> {
  if (drop.alert.kind === 'none' || !drop.alert.value) return
  try {
    if (drop.alert.kind === 'builtin') {
      const id = drop.alert.value.padStart(2, '0')
      const soundUrl = new URL(`../assets/sounds/AlertSound_${id}.ogg`, import.meta.url).href
      const audio = new Audio(soundUrl)
      audio.volume = volume
      await audio.play().catch(() => {})
      return
    }
    if (drop.alert.kind === 'custom' && filterDir) {
      const url = await window.api.getSoundDataUrl(filterDir, drop.alert.value)
      if (!url) return
      const audio = new Audio(url)
      audio.volume = volume
      await audio.play().catch(() => {})
    }
  } catch {
    // ignore preview failures
  }
}

export function LootSimulator({ filterPath }: Props): JSX.Element {
  const [sections, setSections] = useState<FilterSection[]>([])
  const [sectionType, setSectionType] = useState('')
  const [count, setCount] = useState(24)
  const [playSounds, setPlaySounds] = useState(true)
  const [showHidden, setShowHidden] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [drops, setDrops] = useState<LootSimDrop[]>([])
  const [visibleIds, setVisibleIds] = useState<Set<string>>(new Set())
  const [stats, setStats] = useState<{ shown: number; hidden: number } | null>(null)
  const [previewVolume, setPreviewVolume] = useState(0.25)
  const [filterDir, setFilterDir] = useState<string | null>(null)
  const cancelRef = useRef(0)

  useEffect(() => {
    void window.api.getSettings().then((s) => {
      if (typeof s.previewVolume === 'number') setPreviewVolume(s.previewVolume)
      setFilterDir(s.activeProfile?.filterDir ?? null)
    })
  }, [])

  const refreshSections = useCallback(async (): Promise<void> => {
    if (!window.api.getFilterSections) return
    const result = await window.api.getFilterSections()
    if (!result.ok) {
      setSections([])
      return
    }
    setSections(result.sections)
    setSectionType((prev) => {
      if (prev && result.sections.some((s) => s.typePath === prev)) return prev
      const currency = result.sections.find((s) => s.typePath === 'currency')
      return currency?.typePath ?? result.sections[0]?.typePath ?? ''
    })
  }, [])

  useEffect(() => {
    void refreshSections()
  }, [filterPath, refreshSections])

  const active = useMemo(
    () => sections.find((s) => s.typePath === sectionType) ?? sections[0] ?? null,
    [sections, sectionType],
  )

  const pool: LootSimPoolItem[] = useMemo(() => {
    if (!active) return []
    const seen = new Set<string>()
    const out: LootSimPoolItem[] = []
    for (const tier of active.tiers) {
      for (const base of tier.baseTypes) {
        if (seen.has(base)) continue
        seen.add(base)
        out.push({
          name: base,
          baseType: base,
          itemClass: 'Stackable Currency',
          rarity: 'Normal',
        })
      }
    }
    return out
  }, [active])

  const runSim = async (): Promise<void> => {
    if (!pool.length) {
      setError('No BaseTypes in this section to simulate')
      return
    }
    const runId = ++cancelRef.current
    setBusy(true)
    setError(null)
    setVisibleIds(new Set())
    try {
      const result = await window.api.simulateLootDrops({
        pool,
        count,
        seed: Date.now(),
      })
      if (!result.ok) {
        setError(result.error ?? 'Simulation failed')
        setDrops([])
        setStats(null)
        return
      }
      setDrops(result.drops)
      setStats({ shown: result.shown, hidden: result.hidden })

      // Stagger reveal + sounds so it feels like a pack drop
      for (let i = 0; i < result.drops.length; i++) {
        if (cancelRef.current !== runId) return
        const drop = result.drops[i]
        setVisibleIds((prev) => new Set(prev).add(drop.id))
        if (playSounds && !drop.hidden) {
          void playDropAlert(drop, previewVolume, filterDir)
        }
        await new Promise((r) => setTimeout(r, 70))
      }
    } finally {
      if (cancelRef.current === runId) setBusy(false)
    }
  }

  if (!filterPath) {
    return <p style={{ margin: 0, fontSize: 12, color: '#9a9aab' }}>Select a local filter to run the loot simulator.</p>
  }

  const rendered = drops.filter((d) => showHidden || !d.hidden)

  return (
    <div
      style={{
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 8,
        background: '#12131a',
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#f0e6d2' }}>Loot simulator</div>
        <button
          type="button"
          className="primary"
          disabled={busy || pool.length === 0}
          onClick={() => void runSim()}
          style={{ fontSize: 12 }}
        >
          {busy ? 'Dropping…' : 'Simulate drops'}
        </button>
      </div>

      <p style={{ margin: 0, fontSize: 11, color: '#9a9aab', lineHeight: 1.4 }}>
        Rolls items from a filter section against your active local filter — shows Fontin labels and plays alert sounds
        like a pack drop.
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'end' }}>
        <label
          style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: '#9a9aab', minWidth: 160 }}
        >
          Section pool
          <select
            value={active?.typePath ?? ''}
            onChange={(e) => setSectionType(e.target.value)}
            style={{
              background: '#0a0b10',
              color: '#f0e6d2',
              border: '1px solid rgba(255,255,255,0.14)',
              borderRadius: 6,
              padding: '7px 8px',
              fontSize: 12,
            }}
          >
            {sections.map((s) => (
              <option key={s.typePath} value={s.typePath}>
                {s.title} ({s.tiers.reduce((n, t) => n + t.itemCount, 0)} items)
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: '#9a9aab' }}>
          Drop count
          <select
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            style={{
              background: '#0a0b10',
              color: '#f0e6d2',
              border: '1px solid rgba(255,255,255,0.14)',
              borderRadius: 6,
              padding: '7px 8px',
              fontSize: 12,
            }}
          >
            {[12, 24, 40, 60].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>

        <label
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#f0e6d2', paddingBottom: 6 }}
        >
          <input type="checkbox" checked={playSounds} onChange={(e) => setPlaySounds(e.target.checked)} />
          Play sounds
        </label>

        <label
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#f0e6d2', paddingBottom: 6 }}
        >
          <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} />
          Show hidden
        </label>
      </div>

      {error && <div style={{ color: '#f87171', fontSize: 12 }}>{error}</div>}

      {stats && (
        <div style={{ fontSize: 11, color: '#9a9aab' }}>
          Result: {stats.shown} shown · {stats.hidden} hidden · pool {pool.length} BaseTypes
        </div>
      )}

      <div
        style={{
          position: 'relative',
          height: 280,
          borderRadius: 8,
          border: '1px solid rgba(255,255,255,0.1)',
          background:
            'radial-gradient(ellipse at center, rgba(40,36,28,0.9) 0%, rgba(12,12,16,1) 70%), repeating-linear-gradient(0deg, transparent, transparent 11px, rgba(255,255,255,0.02) 12px)',
          overflow: 'hidden',
        }}
      >
        {rendered.length === 0 && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#6a6a78',
              fontSize: 12,
            }}
          >
            Click Simulate drops to scatter loot
          </div>
        )}
        {rendered.map((drop) => {
          const shown = visibleIds.has(drop.id)
          return (
            <button
              key={drop.id}
              type="button"
              title={`${drop.name}${drop.hidden ? ' (hidden)' : ''} — click to replay sound`}
              onClick={() => void playDropAlert(drop, previewVolume, filterDir)}
              style={{
                position: 'absolute',
                left: `${drop.x}%`,
                top: `${drop.y}%`,
                transform: 'translate(-50%, -50%)',
                opacity: shown ? 1 : 0,
                transition: 'opacity 120ms ease-out',
                background: 'transparent',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                maxWidth: '42%',
                zIndex: drop.hidden ? 1 : 2,
              }}
            >
              {drop.hidden ? (
                <HiddenLootLabel label={drop.name} />
              ) : drop.blocks ? (
                <LootLabel blocks={drop.blocks} label={drop.name} />
              ) : (
                <HiddenLootLabel label={drop.name} />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
