import { useEffect, useRef, useState } from 'react'
import type { ProfileState } from '@scalpel/stream-contract'
import type { StreamCharacterOption, StreamOverview } from '@shared/contracts/stream'
import { SettingSelectBox } from '@renderer/components/primitives/SettingSelectBox'
import { SettingToggleBox } from '@renderer/components/primitives/SettingToggleBox'
import { formatTimeAgo } from '@renderer/shared/trade-results/constants'
import { stripIpcErrorWrapper } from '@renderer/shared/utils'
import { m } from '@shared/paraglide/messages.js'

const AUTO = 'auto'

function errorText(e: unknown): string {
  return stripIpcErrorWrapper(e instanceof Error ? e.message : String(e))
}

function characterKey(c: { account: string; name: string }): string {
  return `${c.account}|${c.name}`
}

function phaseText(overview: StreamOverview): string {
  const { phase, error } = overview.publisher
  if (phase === 'waiting-for-game') return m.settings_stream_phase_waiting()
  if (phase === 'working') return m.settings_stream_phase_working()
  if (phase === 'idle') return m.settings_stream_phase_idle()
  if (phase === 'error') return m.settings_stream_phase_error({ error: error ?? '' })
  return m.settings_stream_phase_off()
}

/** A text setting saved on blur or Enter. It follows `value` (main may rewrite or
 *  auto-fill it) unless the streamer is mid-edit; `onCommit` resolves to the value main
 *  settled on, or null when the save failed and the draft should stay for another try. */
function CommitTextBox({
  label,
  value,
  placeholder,
  onCommit,
}: {
  label: string
  value: string
  placeholder: string
  onCommit: (text: string) => Promise<string | null>
}): JSX.Element {
  const [draft, setDraft] = useState(value)
  const dirty = useRef(false)

  useEffect(() => {
    if (!dirty.current) setDraft(value)
  }, [value])

  const commit = (): void => {
    if (!dirty.current) return
    if (draft.trim() === value) {
      dirty.current = false
      return
    }
    void onCommit(draft).then((settled) => {
      if (settled === null) return
      dirty.current = false
      // Show what main stored (a pasted URL becomes the account), so a later blur is a no-op.
      setDraft(settled)
    })
  }

  return (
    <section>
      <label>{label}</label>
      <div className="setting-box mt-[2px] min-h-[40px]">
        <input
          className="value flex-1 bg-transparent outline-none"
          value={draft}
          placeholder={placeholder}
          onChange={(e) => {
            dirty.current = true
            setDraft(e.target.value)
          }}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
      </div>
    </section>
  )
}

/** Scalpel Stream: publishes the streamer's PoE2 gear to the Twitch extension and
 *  public page. State lives in main (see src/main/stream); this section only
 *  renders the overview main broadcasts and forwards the streamer's choices. */
export function StreamSection(): JSX.Element {
  const [overview, setOverview] = useState<StreamOverview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [characters, setCharacters] = useState<StreamCharacterOption[]>([])
  const [pairing, setPairing] = useState<{ code: string; expiresUtc: string } | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [confirmingRemove, setConfirmingRemove] = useState(false)

  useEffect(() => {
    let alive = true
    window.api
      .streamGetOverview()
      .then((o) => {
        if (!alive) return
        setOverview(o)
      })
      .catch((e) => alive && setError(errorText(e)))
    // Main may auto-fill the account (e.g. once it finds the linked Twitch channel on
    // poe.ninja); CommitTextBox picks that up unless the streamer is mid-edit.
    const off = window.api.onStreamOverview(setOverview)
    return () => {
      alive = false
      off()
    }
  }, [])

  const enabled = overview?.settings.enabled ?? false
  const poeAccount = overview?.settings.poeAccount ?? ''

  useEffect(() => {
    if (!enabled || !poeAccount) {
      setCharacters([])
      return
    }
    let alive = true
    window.api
      .streamListCharacters()
      .then((list) => alive && setCharacters(list))
      .catch(() => alive && setCharacters([]))
    return () => {
      alive = false
    }
  }, [enabled, poeAccount])

  const run = async (action: () => Promise<StreamOverview>): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      setOverview(await action())
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  const copy = (label: string, text: string): void => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(label)
      setTimeout(() => setCopied((c) => (c === label ? null : c)), 1500)
    })
  }

  /** Save one text setting; resolves to the value main stored, or null when the save failed. */
  const saveText = async (key: 'poeAccount' | 'buildGuideUrl', text: string): Promise<string | null> => {
    let settled: string | null = null
    await run(async () => {
      const next = await window.api.streamUpdateSettings({ [key]: text })
      settled = next.settings[key]
      return next
    })
    return settled
  }

  if (!overview) {
    return (
      <section>
        <div className="settings-section-title mt-3">{m.settings_stream_heading()}</div>
        <p className="text-[11px] text-text-dim mt-[6px]">{error ?? m.common_loading()}</p>
      </section>
    )
  }

  const pinned = overview.settings.pinnedCharacter
  const characterOptions = [
    { value: AUTO, label: m.settings_stream_character_auto() },
    ...characters.map((c) => ({
      value: characterKey(c),
      label: [c.name, c.league, c.level ? `lvl ${c.level}` : null].filter(Boolean).join(' · '),
    })),
  ]
  if (pinned && !characters.some((c) => characterKey(c) === characterKey(pinned))) {
    characterOptions.push({ value: characterKey(pinned), label: pinned.name })
  }

  const stateOptions: Array<{ value: ProfileState; label: string }> = [
    { value: 'live', label: m.settings_stream_state_live() },
    { value: 'paused', label: m.settings_stream_state_paused() },
    { value: 'hidden', label: m.settings_stream_state_hidden() },
  ]

  const { publisher, profile } = overview
  const linkedChannel = profile?.twitch?.login ?? profile?.twitch?.channelId ?? null

  return (
    <section>
      <div className="settings-section-title mt-3">{m.settings_stream_heading()}</div>
      <div className="flex flex-col gap-[10px] mt-[6px]">
        <SettingToggleBox
          label={m.settings_stream_enable()}
          checked={enabled}
          inlineLabel
          onChange={(next) => void run(() => (next ? window.api.streamEnable() : window.api.streamDisable()))}
        />
        {!enabled && <p className="text-[10px] text-text-dim">{m.settings_stream_intro()}</p>}

        {enabled && (
          <>
            <div className="grid grid-cols-2 gap-x-2 gap-y-[10px]">
              <CommitTextBox
                label={m.settings_stream_poe_account()}
                value={poeAccount}
                placeholder={m.settings_stream_poe_account_placeholder()}
                onCommit={(text) => saveText('poeAccount', text)}
              />
              <SettingSelectBox
                label={m.settings_stream_character()}
                value={pinned ? characterKey(pinned) : AUTO}
                options={characterOptions}
                onChange={(v) => {
                  const choice = v === AUTO ? null : (characters.find((c) => characterKey(c) === v) ?? pinned)
                  void run(() =>
                    window.api.streamUpdateSettings({
                      pinnedCharacter: choice ? { account: choice.account, name: choice.name } : null,
                    }),
                  )
                }}
              />
              <SettingSelectBox
                label={m.settings_stream_viewers_see()}
                value={profile?.state ?? 'live'}
                options={stateOptions}
                onChange={(v) => void run(() => window.api.streamSetState(v))}
              />
              <SettingToggleBox
                label={m.settings_stream_hide_name()}
                checked={overview.settings.hideCharacterName}
                onChange={(v) => void run(() => window.api.streamUpdateSettings({ hideCharacterName: v }))}
              />
              <CommitTextBox
                label={m.settings_stream_build_guide()}
                value={overview.settings.buildGuideUrl}
                placeholder={m.settings_stream_build_guide_placeholder()}
                onCommit={(text) => saveText('buildGuideUrl', text)}
              />
              {/* The filters link is built from the account, so it only means something once there is one. */}
              {poeAccount && (
                <SettingToggleBox
                  label={m.settings_stream_link_filters()}
                  checked={overview.settings.linkItemFilters}
                  onChange={(v) => void run(() => window.api.streamUpdateSettings({ linkItemFilters: v }))}
                />
              )}
            </div>

            <section>
              <label>{m.settings_stream_extension()}</label>
              <div className="setting-box mt-[2px] min-h-[40px]">
                {linkedChannel ? (
                  <span className="value text-accent">{m.settings_stream_linked_to({ channel: linkedChannel })}</span>
                ) : pairing ? (
                  <span className="value font-mono text-[15px] tracking-[0.2em] text-text">{pairing.code}</span>
                ) : (
                  <span className="value text-text-dim">{m.settings_stream_not_linked()}</span>
                )}
                {!linkedChannel && (
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() => {
                      setError(null)
                      window.api
                        .streamPairingCode()
                        .then(setPairing)
                        .catch((e) => setError(errorText(e)))
                    }}
                  >
                    {m.settings_stream_get_code()}
                  </button>
                )}
              </div>
              {pairing && !linkedChannel && (
                <p className="text-[10px] text-text-dim mt-[4px]">{m.settings_stream_code_hint()}</p>
              )}
            </section>

            {overview.publicUrl && overview.obsUrl ? (
              [
                { label: m.settings_stream_public_page(), url: overview.publicUrl },
                { label: m.settings_stream_obs(), url: overview.obsUrl },
              ].map(({ label, url }) => (
                <section key={label}>
                  <label>{label}</label>
                  <div className="setting-box mt-[2px] min-h-[40px]">
                    <span className="value truncate" title={url}>
                      {url}
                    </span>
                    <button
                      className="text-[11px] text-text-dim shrink-0 ml-2 px-3 py-[5px]"
                      onClick={() => copy(label, url)}
                    >
                      {copied === label ? m.settings_stream_copied() : m.settings_stream_copy()}
                    </button>
                  </div>
                </section>
              ))
            ) : (
              <section>
                <label>{m.settings_stream_links()}</label>
                <p className="text-[10px] text-text-dim mt-[4px]">{m.settings_stream_links_pending()}</p>
              </section>
            )}

            <section>
              <label>{m.settings_stream_status()}</label>
              <div className="setting-box mt-[2px] min-h-[40px]">
                {/* Errors say what to do next, so they wrap instead of truncating. */}
                <span
                  className={`value ${publisher.phase === 'error' ? 'text-danger !whitespace-normal break-words' : ''}`}
                >
                  {phaseText(overview)}
                  {publisher.character && ` · ${publisher.character.name}`}
                  {publisher.lastPushUtc &&
                    ` · ${m.settings_stream_published({ ago: formatTimeAgo(publisher.lastPushUtc) })}`}
                </span>
                <button className="primary" disabled={busy} onClick={() => void run(() => window.api.streamPushNow())}>
                  {m.settings_stream_push_now()}
                </button>
              </div>
              {publisher.sourceUpdatedUtc && (
                <p className="text-[10px] text-text-dim mt-[4px]">
                  {m.settings_stream_source_age({ ago: formatTimeAgo(publisher.sourceUpdatedUtc) })}
                  {publisher.patchedSlots.length > 0 &&
                    ` · ${m.settings_stream_patched({ slots: publisher.patchedSlots.join(', ') })}`}
                </p>
              )}
            </section>
          </>
        )}

        {error && <p className="text-[10px] text-danger">{error}</p>}
        {overview.profileError && enabled && <p className="text-[10px] text-text-dim">{overview.profileError}</p>}

        {overview.settings.profileId && (
          <button
            className="self-start text-[11px] px-3 py-1.5 text-text-dim"
            disabled={busy}
            onClick={() => {
              if (!confirmingRemove) {
                setConfirmingRemove(true)
                return
              }
              setConfirmingRemove(false)
              setPairing(null)
              void run(() => window.api.streamDeleteProfile())
            }}
          >
            {confirmingRemove ? m.settings_stream_remove_confirm() : m.settings_stream_remove()}
          </button>
        )}
      </div>
    </section>
  )
}
