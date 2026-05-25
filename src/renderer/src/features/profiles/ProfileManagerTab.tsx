import { useEffect, useState } from 'react'
import type { GameVariant, PoeProfileSummary, RuntimeSettings } from '../../../../shared/types'
import { DismissibleTip } from '../../shared/DismissibleTip'

function filterName(profile: PoeProfileSummary): string {
  return profile.filterPath ? profile.filterPath.replace(/^.*[\\/]/, '') : 'No filter selected'
}

function inGameFilterName(profile: PoeProfileSummary): string | null {
  if (!profile.filterPath) return null
  return profile.filterPath.replace(/^.*[\\/]/, '').replace(/\.filter$/i, '')
}

function defaultProfileName(variant: GameVariant): string {
  return variant === 2 ? 'PoE2 profile' : 'PoE1 profile'
}

export function ProfileManagerTab({
  settings,
  onSettingsChange,
  onEditProfile,
}: {
  settings: RuntimeSettings
  onSettingsChange: (settings: RuntimeSettings) => void
  onEditProfile: (profile: PoeProfileSummary) => void
}): JSX.Element {
  const [profiles, setProfiles] = useState<PoeProfileSummary[]>([])
  const [switchedFilterName, setSwitchedFilterName] = useState<string | null>(null)
  const [draft, setDraft] = useState<
    | { kind: 'create'; gameVariant: GameVariant; name: string }
    | { kind: 'duplicate'; sourceId: string; name: string }
    | { kind: 'rename'; sourceId: string; name: string }
    | null
  >(null)
  const [error, setError] = useState<string | null>(null)

  const reloadProfiles = async (): Promise<void> => {
    setProfiles(await window.api.listProfiles())
  }

  useEffect(() => {
    void reloadProfiles()
  }, [])

  const activate = async (profile: PoeProfileSummary): Promise<void> => {
    setError(null)
    const result = await window.api.setActiveProfile(profile.id)
    if (!result.ok && 'requiresRestart' in result) {
      const confirmed = window.confirm(
        `Switching to a PoE${result.targetGame} profile requires restarting Scalpel so the overlay can attach to the correct game. Restart now?`,
      )
      if (!confirmed) return
      const restartResult = await window.api.setActiveProfile(profile.id, true)
      if (!restartResult.ok) {
        setError('Could not switch profile.')
        return
      }
      if ('settings' in restartResult) {
        onSettingsChange(restartResult.settings)
        setSwitchedFilterName(inGameFilterName(profile))
        await reloadProfiles()
      }
      if ('devRestartRequired' in restartResult) {
        setError('Profile selected. Restart the dev app to attach to the selected game.')
      }
      return
    }
    if (!result.ok) {
      setError(result.error)
      return
    }
    if (!('settings' in result)) return
    onSettingsChange(result.settings)
    setSwitchedFilterName(inGameFilterName(profile))
    await reloadProfiles()
  }

  const submitDraft = async (): Promise<void> => {
    if (!draft) return
    const name = draft.name.trim()
    if (!name) {
      setError('Profile name is required.')
      return
    }
    setError(null)
    try {
      if (draft.kind === 'create') {
        await window.api.createProfile({ name, gameVariant: draft.gameVariant })
      } else if (draft.kind === 'duplicate') {
        await window.api.duplicateProfile(draft.sourceId, name)
      } else {
        await window.api.renameProfile(draft.sourceId, name)
      }
      setDraft(null)
      await reloadProfiles()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save profile.')
    }
  }

  const rename = async (profile: PoeProfileSummary): Promise<void> => {
    setDraft({ kind: 'rename', sourceId: profile.id, name: profile.name })
    setError(null)
  }

  const duplicate = async (profile: PoeProfileSummary): Promise<void> => {
    setDraft({ kind: 'duplicate', sourceId: profile.id, name: `${profile.name} copy` })
    setError(null)
  }

  const remove = async (profile: PoeProfileSummary): Promise<void> => {
    if (!window.confirm(`Delete "${profile.name}"?`)) return
    setError(null)
    await window.api.deleteProfile(profile.id)
    onSettingsChange(await window.api.getSettings())
    await reloadProfiles()
  }

  const groups: Array<{ variant: GameVariant; label: string }> = [
    { variant: 1, label: 'Path of Exile 1' },
    { variant: 2, label: 'Path of Exile 2' },
  ]

  return (
    <>
      <div className="settings-section-title mt-3">Profiles</div>
      <p className="text-[11px] text-text-dim m-0 -mt-2">
        Create a named setup for each league, character, or filter context you want to switch back to later.
      </p>

      <div className="flex flex-col gap-5">
        {switchedFilterName && (
          <DismissibleTip id="profile-manager.itemfilter-command">
            Update Path of Exile after switching profiles: type{' '}
            <code className="font-mono text-[11px] text-text">/itemfilter {switchedFilterName}</code> in chat.
          </DismissibleTip>
        )}

        {error && !draft && <p className="text-[11px] text-red-300 m-0">{error}</p>}

        {draft && (
          <section className="rounded border border-border bg-black/20 px-3 py-3 flex flex-col gap-3">
            <label className="text-[11px] text-text-dim">
              {draft.kind === 'create'
                ? 'New profile name'
                : draft.kind === 'duplicate'
                  ? 'Duplicate profile name'
                  : 'Rename profile'}
            </label>
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submitDraft()
                if (e.key === 'Escape') setDraft(null)
              }}
              className="w-full text-[12px] bg-black/30 rounded px-2 py-[7px] border-none text-text"
              autoFocus
            />
            {error && <p className="text-[11px] text-red-300 m-0">{error}</p>}
            <div className="flex gap-2 justify-end">
              <button className="text-[11px] px-3 py-1.5" onClick={() => setDraft(null)}>
                Cancel
              </button>
              <button className="primary text-[11px] px-3 py-1.5" onClick={() => void submitDraft()}>
                Save
              </button>
            </div>
          </section>
        )}

        {groups.map(({ variant, label }) => {
          const matching = profiles.filter((profile) => profile.gameVariant === variant)
          return (
            <section key={variant} className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <div className="settings-section-title mt-0 flex-1">{label}</div>
                <button
                  className="text-[11px] px-3 py-1.5"
                  onClick={() => {
                    setDraft({ kind: 'create', gameVariant: variant, name: defaultProfileName(variant) })
                    setError(null)
                  }}
                >
                  New
                </button>
              </div>
              {matching.length === 0 ? (
                <p className="text-[11px] text-text-dim m-0">No profiles yet.</p>
              ) : (
                matching.map((profile) => {
                  const needsRestart = profile.gameVariant !== settings.poeVersion
                  return (
                    <div
                      key={profile.id}
                      className="rounded border border-border bg-black/20 px-3 py-2 flex flex-col gap-2"
                    >
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-semibold text-text truncate">{profile.name}</div>
                          <div className="text-[11px] text-text-dim truncate">
                            {profile.league || 'No league'} - {filterName(profile)}
                          </div>
                        </div>
                        {profile.id === settings.activeProfileId && (
                          <span className="text-[10px] text-accent font-semibold shrink-0">Active</span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {profile.id !== settings.activeProfileId && (
                          <button className="primary text-[11px] px-3 py-1.5" onClick={() => void activate(profile)}>
                            {needsRestart ? 'Restart to Switch' : 'Switch'}
                          </button>
                        )}
                        <button className="text-[11px] px-3 py-1.5" onClick={() => onEditProfile(profile)}>
                          {needsRestart ? 'Restart to Edit' : 'Edit'}
                        </button>
                        <button className="text-[11px] px-3 py-1.5" onClick={() => void duplicate(profile)}>
                          Duplicate
                        </button>
                        <button className="text-[11px] px-3 py-1.5" onClick={() => void rename(profile)}>
                          Rename
                        </button>
                        <button className="text-[11px] px-3 py-1.5 text-text-dim" onClick={() => void remove(profile)}>
                          Delete
                        </button>
                      </div>
                    </div>
                  )
                })
              )}
            </section>
          )
        })}
      </div>
    </>
  )
}
