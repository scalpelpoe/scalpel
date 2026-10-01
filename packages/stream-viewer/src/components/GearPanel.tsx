import type { Keystone, SnapshotItem, StreamHead, StreamSnapshot } from '@scalpel/stream-contract'
import { ErrorBanner } from '@renderer/components/ErrorBanner'
import { Button } from '@renderer/components/primitives/Button'
import { useEffect, useState } from 'react'
import { CharacterHeader, UpdatedAge } from './CharacterHeader'
import { ItemSlot } from './ItemSlot'
import { ItemTooltip } from './ItemTooltip'
import { Paperdoll } from './Paperdoll'
import { StreamLinks } from './StreamLinks'
import { PoweredBy, Window } from './Window'

type Tab = 'gear' | 'skills' | 'jewels' | 'keystones'

/** Where the hovered/pinned item's card goes: beside the panel (video overlay) or under it. */
export type TooltipPlacement = 'side' | 'below'

interface Props {
  snapshot: StreamSnapshot
  head: StreamHead
  now: number
  placement: TooltipPlacement
}

function SkillsList({ snapshot }: { snapshot: StreamSnapshot }): JSX.Element {
  if (snapshot.skills.length === 0) return <div className="ssv-message">No skills listed.</div>
  return (
    <div className="flex flex-col gap-1.5">
      {snapshot.skills.map((skill, i) => (
        <div key={i} className="flex gap-2 p-2 rounded bg-black/30">
          {skill.gem.icon ? <img className="w-7 h-7 shrink-0 object-contain" src={skill.gem.icon} alt="" /> : null}
          <div className="min-w-0">
            <div className="font-bold ssv-r-gem">{skill.gem.name}</div>
            <div className="text-[10.5px] text-text-dim">
              {[skill.gem.level ? `Level ${skill.gem.level}` : null, skill.gem.quality ? `${skill.gem.quality}% quality` : null]
                .filter(Boolean)
                .join(' · ')}
            </div>
            {skill.supports.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {skill.supports.map((s, j) => (
                  <span key={j} className="flex items-center gap-1 px-1.5 rounded bg-black/30 text-[10.5px]">
                    {s.icon && <img className="w-3.5 h-3.5" src={s.icon} alt="" />}
                    {s.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

/** Keystone art, with the name and what it does beside it. */
function KeystoneList({ keystones }: { keystones: Keystone[] }): JSX.Element {
  if (keystones.length === 0) return <div className="ssv-message">No keystones allocated.</div>
  return (
    <div className="flex flex-col gap-1.5">
      {keystones.map((k) => (
        <div key={k.name} className="flex items-start gap-2.5 p-2 rounded bg-black/30">
          {k.icon ? (
            <img className="w-10 h-10 shrink-0 object-contain" src={k.icon} alt="" />
          ) : (
            <div className="w-10 h-10 shrink-0" />
          )}
          <div className="min-w-0">
            <div className="font-bold text-accent">{k.name}</div>
            {k.stats.map((line, i) => (
              <div key={i} className="text-[11px] text-text-dim whitespace-pre-line">
                {line}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function CopyPob({ pob }: { pob: string | null }): JSX.Element {
  const [state, setState] = useState<'idle' | 'copied' | 'manual'>('idle')
  if (state === 'manual' && pob) {
    // Clipboard access can be blocked inside the Twitch player iframe; let the viewer copy by hand.
    return (
      <textarea
        readOnly
        value={pob}
        aria-label="Path of Building code"
        rows={2}
        className="w-full text-[10px] bg-bg-card text-text border border-border rounded px-2 py-1"
        onFocus={(e) => e.currentTarget.select()}
        ref={(el) => el?.select()}
      />
    )
  }
  return (
    <Button
      size="sm"
      disabled={!pob}
      title={pob ? 'Copy this build as a Path of Building code' : 'No Path of Building export for this character'}
      onClick={() => {
        if (!pob) return
        const write = navigator.clipboard?.writeText(pob)
        if (!write) return setState('manual')
        write.then(
          () => setState('copied'),
          () => setState('manual'),
        )
      }}
    >
      {state === 'copied' ? 'Copied' : 'Copy PoB'}
    </Button>
  )
}

/** The whole viewer card: title strip, tabs, gear / skills / jewels / keystones, footer. */
export function GearPanel({ snapshot, head, now, placement }: Props): JSX.Element {
  const [tab, setTab] = useState<Tab>('gear')
  const [hovered, setHovered] = useState<SnapshotItem | null>(null)
  const [pinned, setPinned] = useState<SnapshotItem | null>(null)

  // A new snapshot replaces every item object; drop stale selections.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset keyed on the snapshot identity only.
  useEffect(() => {
    setHovered(null)
    setPinned(null)
  }, [snapshot])

  const shown = hovered ?? pinned
  const pin = (item: SnapshotItem): void => setPinned((p) => (p === item ? null : item))
  const cardTab = tab === 'gear' || tab === 'jewels'
  // A hover never gets its mouseleave once the tab's slots unmount, so every switch clears the card.
  const selectTab = (next: Tab): void => {
    setTab(next)
    setHovered(null)
    setPinned(null)
  }
  const tabs: Array<[Tab, string]> = [
    ['gear', 'Gear'],
    ['skills', 'Skills'],
    ['jewels', `Jewels${snapshot.jewels.length ? ` (${snapshot.jewels.length})` : ''}`],
    ['keystones', 'Keystones'],
  ]

  return (
    <div className="ssv-panel">
      {placement === 'side' && shown && cardTab && (
        <div className="ssv-overlay-tooltip">
          <ItemTooltip item={shown} />
        </div>
      )}
      <Window
        title="Scalpel Stream"
        headerEnd={<UpdatedAge snapshot={snapshot} now={now} />}
        footer={
          <>
            <CopyPob pob={snapshot.pob} />
            <StreamLinks links={snapshot.links} />
            <PoweredBy />
          </>
        }
      >
        <CharacterHeader snapshot={snapshot} />
        <ErrorBanner
          inline
          tone="warn"
          message={head.state === 'paused' ? 'Paused by the streamer. Showing the last gear.' : null}
        />
        <div className="flex flex-wrap gap-[6px] px-3 pt-2" role="tablist">
          {tabs.map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              className={`text-[11px] px-3 py-1.5 ${tab === key ? 'bg-accent text-bg-solid' : 'text-text-dim'}`}
              onClick={() => selectTab(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="ssv-panel-body">
          {tab === 'gear' && <Paperdoll snapshot={snapshot} selected={shown} onHover={setHovered} onPin={pin} />}
          {tab === 'skills' && <SkillsList snapshot={snapshot} />}
          {tab === 'jewels' &&
            (snapshot.jewels.length === 0 ? (
              <div className="ssv-message">No jewels socketed.</div>
            ) : (
              <div className="ssv-jewels">
                {snapshot.jewels.map((jewel, i) => (
                  <ItemSlot
                    key={i}
                    item={jewel}
                    label="Jewel"
                    active={jewel === shown}
                    onHover={setHovered}
                    onPin={pin}
                  />
                ))}
              </div>
            ))}
          {tab === 'keystones' && <KeystoneList keystones={snapshot.keystones} />}
          {placement === 'below' && shown && cardTab && (
            <div className="ssv-inline-tooltip">
              <ItemTooltip item={shown} />
            </div>
          )}
        </div>
      </Window>
    </div>
  )
}
