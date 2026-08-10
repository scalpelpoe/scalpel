import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FilterSection, FilterSectionTier } from '@shared/types'
import { HiddenLootLabel, LootLabel } from '@renderer/shared/LootLabel'
import { TierStyleEditor } from './TierStyleEditor'

interface Props {
  filterPath?: string | null
}

interface DragPayload {
  baseType: string
  fromBlockIndex: number
}

/** FilterBlade-style section browser with style edit, DnD, and Add rule. */
export function FilterSectionEditor({ filterPath }: Props): JSX.Element {
  const [sections, setSections] = useState<FilterSection[]>([])
  const [loadedPath, setLoadedPath] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')
  const [activeType, setActiveType] = useState('')
  const [expandedTier, setExpandedTier] = useState<number | null>(null)
  const [styleBlock, setStyleBlock] = useState<{ index: number; label: string } | null>(null)
  const [dropTarget, setDropTarget] = useState<number | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [addName, setAddName] = useState('')
  const [addTier, setAddTier] = useState('')
  const [addMode, setAddMode] = useState<'existing' | 'new'>('existing')
  const [addNewTierId, setAddNewTierId] = useState('custom')

  const refresh = useCallback(async (): Promise<void> => {
    if (!window.api.getFilterSections) return
    const result = await window.api.getFilterSections()
    if (!result.ok) {
      setError(result.error ?? 'No filter loaded')
      setSections([])
      setLoadedPath(null)
      return
    }
    setError(null)
    setSections(result.sections)
    setLoadedPath(result.path ?? null)
    setActiveType((prev) => {
      if (prev && result.sections.some((s) => s.typePath === prev)) return prev
      return result.sections[0]?.typePath ?? ''
    })
  }, [])

  useEffect(() => {
    void refresh()
  }, [filterPath, refresh])

  const active = useMemo(
    () => sections.find((s) => s.typePath === activeType) ?? sections[0] ?? null,
    [sections, activeType],
  )

  const tiers = useMemo(() => {
    if (!active) return []
    const q = query.trim().toLowerCase()
    if (!q) return active.tiers
    return active.tiers.filter(
      (t) =>
        t.label.toLowerCase().includes(q) ||
        t.tier.toLowerCase().includes(q) ||
        t.baseTypes.some((b) => b.toLowerCase().includes(q)),
    )
  }, [active, query])

  useEffect(() => {
    if (!addTier && tiers[0]) setAddTier(String(tiers[0].blockIndex))
  }, [tiers, addTier])

  const toggleVisibility = async (tier: FilterSectionTier): Promise<void> => {
    const next = tier.visibility === 'Show' ? 'Hide' : 'Show'
    setBusy(true)
    setError(null)
    try {
      const result = await window.api.setSectionTierVisibility(tier.blockIndex, next)
      if (!result.ok) {
        setError(result.error ?? 'Failed to update visibility')
        return
      }
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  const moveBase = async (baseType: string, fromBlockIndex: number, toBlockIndex: number): Promise<void> => {
    if (fromBlockIndex === toBlockIndex) return
    setBusy(true)
    setError(null)
    try {
      const result = await window.api.moveItemTier(baseType, fromBlockIndex, toBlockIndex, '')
      if (!result.ok) {
        setError(result.error ?? 'Failed to move item')
        return
      }
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  const onDragStart = (e: React.DragEvent, payload: DragPayload): void => {
    e.dataTransfer.setData('application/x-scalpel-basetype', JSON.stringify(payload))
    e.dataTransfer.effectAllowed = 'move'
  }

  const onDragOverTier = (e: React.DragEvent, blockIndex: number): void => {
    if (!e.dataTransfer.types.includes('application/x-scalpel-basetype')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDropTarget(blockIndex)
  }

  const onDropTier = async (e: React.DragEvent, toBlockIndex: number): Promise<void> => {
    e.preventDefault()
    setDropTarget(null)
    const raw = e.dataTransfer.getData('application/x-scalpel-basetype')
    if (!raw) return
    try {
      const payload = JSON.parse(raw) as DragPayload
      await moveBase(payload.baseType, payload.fromBlockIndex, toBlockIndex)
      setExpandedTier(toBlockIndex)
    } catch {
      setError('Invalid drag payload')
    }
  }

  const submitAddRule = async (): Promise<void> => {
    if (!active) return
    const name = addName.trim()
    if (!name) {
      setError('Enter a BaseType name')
      return
    }
    setBusy(true)
    setError(null)
    try {
      if (addMode === 'existing') {
        const blockIndex = Number(addTier)
        const result = await window.api.addBaseTypeToTier(blockIndex, name)
        if (!result.ok) {
          setError(result.error ?? 'Failed to add item')
          return
        }
        setExpandedTier(blockIndex)
      } else {
        const before = active.tiers[0]?.blockIndex
        if (before == null) {
          setError('Section has no tiers to insert before')
          return
        }
        const result = await window.api.insertSectionRule({
          typePath: active.typePath,
          tier: addNewTierId.trim() || 'custom',
          baseType: name,
          beforeBlockIndex: before,
          visibility: 'Show',
          copyStyleFromIndex: before,
        })
        if (!result.ok) {
          setError(result.error ?? 'Failed to add rule')
          return
        }
      }
      setAddName('')
      setAddOpen(false)
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  if (!filterPath) {
    return (
      <p style={{ margin: 0, fontSize: 12, color: '#9a9aab' }}>
        Select a local filter (e.g. 9lives-local) to edit sections.
      </p>
    )
  }

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
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#f0e6d2' }}>Section editor</div>
        <button type="button" disabled={busy} onClick={() => void refresh()} style={{ fontSize: 11 }}>
          Refresh
        </button>
      </div>

      {loadedPath && (
        <div style={{ fontSize: 11, color: '#9a9aab' }}>Editing: {loadedPath.replace(/^.*[\\/]/, '')}</div>
      )}

      {error && <div style={{ fontSize: 12, color: '#f87171' }}>{error}</div>}

      {styleBlock && (
        <TierStyleEditor
          blockIndex={styleBlock.index}
          tierLabel={styleBlock.label}
          onClose={() => setStyleBlock(null)}
          onSaved={() => void refresh()}
        />
      )}

      {sections.length === 0 && !error ? (
        <div style={{ fontSize: 12, color: '#9a9aab' }}>No NeverSink-tagged sections in this filter.</div>
      ) : (
        <>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: '#9a9aab' }}>
            Section
            <select
              value={active?.typePath ?? ''}
              onChange={(e) => {
                setActiveType(e.target.value)
                setExpandedTier(null)
                setStyleBlock(null)
                setAddOpen(false)
              }}
              style={{
                background: '#0a0b10',
                color: '#f0e6d2',
                border: '1px solid rgba(255,255,255,0.14)',
                borderRadius: 6,
                padding: '8px 10px',
                fontSize: 13,
              }}
            >
              {sections.map((s) => (
                <option key={s.typePath} value={s.typePath}>
                  {s.title} ({s.shownCount}/{s.totalCount} shown)
                </option>
              ))}
            </select>
          </label>

          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter tiers / items…"
            style={{
              background: '#0a0b10',
              color: '#f0e6d2',
              border: '1px solid rgba(255,255,255,0.14)',
              borderRadius: 6,
              padding: '8px 10px',
              fontSize: 12,
            }}
          />

          <div style={{ fontSize: 11, color: '#9a9aab' }}>
            Drag items onto another tier · brush edits style · Add rule appends a BaseType
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 360, overflowY: 'auto' }}>
            {tiers.map((tier, idx) => {
              const shown = tier.visibility === 'Show'
              const open = expandedTier === tier.blockIndex
              const isDrop = dropTarget === tier.blockIndex
              return (
                <div
                  key={tier.blockIndex}
                  onDragOver={(e) => onDragOverTier(e, tier.blockIndex)}
                  onDragLeave={() => setDropTarget((t) => (t === tier.blockIndex ? null : t))}
                  onDrop={(e) => void onDropTier(e, tier.blockIndex)}
                  style={{
                    border: isDrop ? '1px solid #c9a227' : '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 6,
                    background: isDrop
                      ? 'rgba(201,162,39,0.12)'
                      : shown
                        ? 'rgba(255,255,255,0.05)'
                        : 'rgba(0,0,0,0.35)',
                    padding: '8px 10px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void toggleVisibility(tier)}
                      title={shown ? 'Hide tier' : 'Show tier'}
                      style={{
                        width: 32,
                        height: 28,
                        fontSize: 16,
                        lineHeight: 1,
                        padding: 0,
                        background: shown ? 'rgba(76,175,80,0.25)' : 'rgba(255,255,255,0.06)',
                        color: '#f0e6d2',
                      }}
                    >
                      {shown ? '☑' : '☐'}
                    </button>

                    <button
                      type="button"
                      onClick={() => setExpandedTier(open ? null : tier.blockIndex)}
                      style={{
                        flex: 1,
                        textAlign: 'left',
                        background: 'transparent',
                        padding: '4px 0',
                        display: 'flex',
                        gap: 8,
                        alignItems: 'center',
                        color: '#f0e6d2',
                      }}
                    >
                      <span style={{ color: '#c9a227', width: 12 }}>{open ? '▾' : '▸'}</span>
                      <span style={{ fontSize: 13, fontWeight: 700 }}>{tier.label}</span>
                      <span style={{ fontSize: 11, color: '#9a9aab' }}>{tier.itemCount} items</span>
                    </button>

                    <button
                      type="button"
                      title="Edit style"
                      disabled={busy}
                      onClick={() => setStyleBlock({ index: tier.blockIndex, label: tier.label })}
                      style={{ width: 30, height: 28, padding: 0, fontSize: 14 }}
                    >
                      🖌
                    </button>

                    <div
                      className="shrink-0 max-w-[180px] overflow-hidden"
                      title={tier.previewLabel}
                      style={{ opacity: shown ? 1 : 0.85 }}
                    >
                      {shown ? (
                        <LootLabel block={{ actions: tier.previewActions }} label={tier.previewLabel} />
                      ) : (
                        <HiddenLootLabel label={tier.previewLabel} />
                      )}
                    </div>
                  </div>

                  {open && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                      {tier.baseTypes.length === 0 ? (
                        <div style={{ fontSize: 11, color: '#9a9aab' }}>
                          No BaseType list — drop items here or Add rule.
                        </div>
                      ) : (
                        tier.baseTypes.map((base) => (
                          <div
                            key={base}
                            draggable={!busy}
                            onDragStart={(e) => onDragStart(e, { baseType: base, fromBlockIndex: tier.blockIndex })}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                              padding: '5px 6px',
                              marginBottom: 4,
                              background: 'rgba(0,0,0,0.35)',
                              borderRadius: 4,
                              fontSize: 12,
                              color: '#f0e6d2',
                              cursor: 'grab',
                            }}
                          >
                            <span style={{ color: '#9a9aab', fontSize: 11 }}>⋮⋮</span>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{base}</span>
                            <button
                              type="button"
                              disabled={busy || idx === 0}
                              onClick={() =>
                                void moveBase(base, tier.blockIndex, tiers[idx - 1]?.blockIndex ?? tier.blockIndex)
                              }
                              style={{ padding: '2px 8px', fontSize: 11 }}
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              disabled={busy || idx >= tiers.length - 1}
                              onClick={() =>
                                void moveBase(base, tier.blockIndex, tiers[idx + 1]?.blockIndex ?? tier.blockIndex)
                              }
                              style={{ padding: '2px 8px', fontSize: 11 }}
                            >
                              ↓
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              disabled={busy || !active}
              onClick={() => setAddOpen((v) => !v)}
              style={{ fontSize: 12 }}
            >
              {addOpen ? 'Cancel' : 'Add rule'}
            </button>
          </div>

          {addOpen && active && (
            <div
              style={{
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 6,
                padding: 10,
                background: '#0a0b10',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, color: '#f0e6d2' }}>Add rule — {active.title}</div>
              <input
                type="text"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder="BaseType name (e.g. Divine Orb)"
                style={{
                  background: '#12131a',
                  color: '#f0e6d2',
                  border: '1px solid rgba(255,255,255,0.14)',
                  borderRadius: 6,
                  padding: '8px 10px',
                  fontSize: 12,
                }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setAddMode('existing')}
                  style={{
                    fontSize: 11,
                    background: addMode === 'existing' ? 'var(--accent)' : 'rgba(255,255,255,0.08)',
                    color: addMode === 'existing' ? '#171821' : '#f0e6d2',
                  }}
                >
                  Add to tier
                </button>
                <button
                  type="button"
                  onClick={() => setAddMode('new')}
                  style={{
                    fontSize: 11,
                    background: addMode === 'new' ? 'var(--accent)' : 'rgba(255,255,255,0.08)',
                    color: addMode === 'new' ? '#171821' : '#f0e6d2',
                  }}
                >
                  New tier rule
                </button>
              </div>
              {addMode === 'existing' ? (
                <select
                  value={addTier}
                  onChange={(e) => setAddTier(e.target.value)}
                  style={{
                    background: '#12131a',
                    color: '#f0e6d2',
                    border: '1px solid rgba(255,255,255,0.14)',
                    borderRadius: 6,
                    padding: '8px 10px',
                    fontSize: 12,
                  }}
                >
                  {tiers.map((t) => (
                    <option key={t.blockIndex} value={t.blockIndex}>
                      {t.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={addNewTierId}
                  onChange={(e) => setAddNewTierId(e.target.value)}
                  placeholder="New tier id (e.g. custom)"
                  style={{
                    background: '#12131a',
                    color: '#f0e6d2',
                    border: '1px solid rgba(255,255,255,0.14)',
                    borderRadius: 6,
                    padding: '8px 10px',
                    fontSize: 12,
                  }}
                />
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="primary"
                  disabled={busy}
                  onClick={() => void submitAddRule()}
                  style={{ fontSize: 12 }}
                >
                  {busy ? 'Adding…' : 'Add'}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
