import { useCallback, useEffect, useState } from 'react'
import type { RegistryEntry, RegistrySnapshot } from '../../../../../shared/plugin-registry-types'
import type { PluginManifest } from '../../../../../plugin-sdk/src/types'
import type { AppSettings, RuntimeSettings } from '../../../../../shared/types'
import type { HotkeySlot } from '../../../components/primitives/hotkey-collisions'
import { Button } from '../../../components/primitives/Button'
import { HotkeyRecorder } from '../../../components/primitives/HotkeyRecorder'
import { pluginHotkeyBinding } from './plugin-hotkey-binding'
import { m } from '../../../../../shared/paraglide/messages.js'
import { latestVersionFor } from '../../../plugins/plugin-update-check'

interface Props {
  onError: (msg: string, tone?: 'error' | 'warn') => void
  settings: RuntimeSettings
  update: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
  tryHotkey: (hotkey: string, slot: HotkeySlot) => boolean
}

interface InstalledEntry {
  manifest: PluginManifest
}

/** Shared row column template: icon | flexible meta | trailing actions. Used by
 *  both row types and by the collapsed description so it aligns under the title
 *  without a hand-tuned indent. */
const ROW_GRID = 'grid grid-cols-[40px_1fr_auto] gap-3'

/** Only surface a badge when the plugin is restricted to one game; "supports
 *  both" is the common case and a badge there is just noise. */
function versionBadge(poeVersions?: (1 | 2)[]): string | null {
  if (!poeVersions || poeVersions.length !== 1) return null
  return poeVersions[0] === 1 ? m.settings_plg_poe1_only() : m.settings_plg_poe2_only()
}

/** 40px round plugin mark: real icon when the registry/manifest supplies one,
 *  otherwise a tinted initial so rows never look broken. */
function PluginIcon({ iconUrl, name }: { iconUrl?: string; name: string }): JSX.Element {
  if (iconUrl) {
    return <img src={iconUrl} alt="" className="w-10 h-10 shrink-0 rounded-full object-cover" />
  }
  return (
    <div className="w-10 h-10 shrink-0 rounded-full grid place-items-center bg-accent/20 text-accent font-bold text-[15px]">
      {name.charAt(0).toUpperCase()}
    </div>
  )
}

function PluginHotkeyBindRow({
  action,
  label,
  settings,
  update,
  tryHotkey,
}: {
  action: string
  label: string
  settings: RuntimeSettings
  update: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
  tryHotkey: (hotkey: string, slot: HotkeySlot) => boolean
}): JSX.Element {
  const { hotkey, setHotkey } = pluginHotkeyBinding({ action, settings, update, tryHotkey })
  return (
    <div className="flex items-center gap-[6px] min-w-0">
      <HotkeyRecorder
        value={hotkey}
        onChange={setHotkey}
        className="w-[200px] shrink-0"
        placeholder={m.settings_plg_set_hotkey()}
        clearable
      />
      {/* Read-only on purpose: the plugin + action are fixed by context, so unlike
          the Macros-tab row there is no editable select or remove control here. */}
      <span className="text-[11px] text-text-dim flex-1 min-w-0 truncate px-3 rounded bg-black/15 h-[34px] box-border flex items-center">
        {label}
      </span>
    </div>
  )
}

function InstalledRow({
  manifest,
  iconUrlFallback,
  busy,
  onUninstall,
  updateVersion,
  onUpdate,
  hotkeys,
  settings,
  update,
  tryHotkey,
}: {
  manifest: PluginManifest
  /** Registry iconUrl, used when the installed manifest omits its own (so the
   *  installed row shows the same icon as the Browse list instead of an initial). */
  iconUrlFallback?: string
  busy: boolean
  onUninstall: () => void
  updateVersion: string | null
  onUpdate: () => void
  hotkeys: Array<{ action: string; label: string }>
  settings: RuntimeSettings
  update: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
  tryHotkey: (hotkey: string, slot: HotkeySlot) => boolean
}): JSX.Element {
  return (
    <div className="flex flex-col gap-2 px-3 py-2.5 rounded-[10px] bg-white/[0.04]">
      <div className={`${ROW_GRID} items-center`}>
        <PluginIcon iconUrl={manifest.iconUrl ?? iconUrlFallback} name={manifest.name} />
        <div className="min-w-0">
          <div className="flex items-center gap-x-2.5 flex-wrap leading-tight">
            <span className="text-[13.5px] font-semibold text-text truncate">{manifest.name}</span>
            <span className="font-mono text-[10.5px] text-zinc-500">v{manifest.version}</span>
          </div>
          <div className="text-[11.5px] text-text-dim mt-0.5 truncate">
            {m.settings_plg_by({ author: manifest.author })}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {updateVersion && (
            <Button variant="primary" size="sm" disabled={busy} onClick={onUpdate}>
              {busy ? m.settings_plg_updating() : m.settings_plg_update({ version: updateVersion })}
            </Button>
          )}
          <Button variant="secondary" size="sm" disabled={busy} onClick={onUninstall}>
            {m.settings_plg_uninstall()}
          </Button>
        </div>
      </div>
      {hotkeys.length > 0 && (
        <div className="flex flex-col gap-1.5 pl-[52px]">
          {hotkeys.map((h) => (
            <PluginHotkeyBindRow
              key={h.action}
              action={h.action}
              label={h.label}
              settings={settings}
              update={update}
              tryHotkey={tryHotkey}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ScreenshotGallery({
  shots,
  activeShot,
  onSelectShot,
}: {
  shots: string[]
  activeShot: number
  onSelectShot: (i: number) => void
}): JSX.Element {
  return (
    <div className="flex flex-col gap-2 mb-3.5">
      <div className="relative aspect-[520/290] rounded-md overflow-hidden bg-black/40">
        <img src={shots[activeShot]} alt="" className="absolute inset-0 w-full h-full object-cover" />
        {shots.length > 1 && (
          <div className="absolute bottom-2 right-2 bg-black/60 text-text font-mono text-[10.5px] px-1.5 py-0.5 rounded">
            {activeShot + 1} / {shots.length}
          </div>
        )}
      </div>
      {shots.length > 1 && (
        <div className="grid grid-flow-col auto-cols-fr gap-1.5">
          {shots.map((url, i) => (
            <button
              key={i}
              onClick={() => onSelectShot(i)}
              className={
                'aspect-[120/70] rounded overflow-hidden bg-black/40 transition-opacity ' +
                (i === activeShot ? 'opacity-100 ring-2 ring-accent' : 'opacity-50 hover:opacity-80')
              }
            >
              <img src={url} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function BrowseRow({
  entry,
  expanded,
  activeShot,
  busy,
  onToggle,
  onInstall,
  onSelectShot,
}: {
  entry: RegistryEntry
  expanded: boolean
  activeShot: number
  busy: boolean
  onToggle: () => void
  onInstall: () => void
  onSelectShot: (i: number) => void
}): JSX.Element {
  const badge = versionBadge(entry.poeVersions)
  const shots = entry.screenshots ?? []
  return (
    <div
      className={
        'rounded-[10px] transition-colors ' + (expanded ? 'bg-white/[0.07]' : 'bg-white/[0.04] hover:bg-white/[0.06]')
      }
    >
      <div onClick={onToggle} className="p-3 cursor-pointer">
        {/* Header stays a fixed-height centered grid so toggling the collapsed
            description below it never shifts the title, author, or icon. */}
        <div className={`${ROW_GRID} items-center`}>
          <PluginIcon iconUrl={entry.iconUrl} name={entry.name} />
          <div className="min-w-0">
            <div className="flex items-center gap-x-2.5 gap-y-0.5 flex-wrap leading-tight">
              <span className="text-[13.5px] font-semibold text-text">{entry.name}</span>
              <span className="font-mono text-[10.5px] text-zinc-500">v{entry.latestVersion}</span>
              {shots.length > 0 && (
                <span
                  className="inline-flex items-center gap-1 font-mono text-[10.5px] text-zinc-500"
                  title={m.settings_plg_screenshots_count({ count: shots.length })}
                >
                  <svg width="10" height="10" viewBox="0 0 16 16" aria-hidden="true">
                    <rect x="1.5" y="3" width="13" height="10" rx="1.5" fill="currentColor" opacity="0.22" />
                    <circle cx="5.5" cy="7" r="1.4" fill="currentColor" />
                    <path
                      d="M2.5 12 L6 8.5 L9 11 L13 7.5 L14.5 9"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  {shots.length}
                </span>
              )}
              {badge && (
                <span className="inline-flex items-center gap-1 text-[10.5px] text-text-dim">
                  <span className="w-[5px] h-[5px] rounded-full bg-current" />
                  {badge}
                </span>
              )}
            </div>
            <div className="text-[11.5px] text-text-dim mt-0.5">{m.settings_plg_by({ author: entry.author })}</div>
          </div>
          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            <Button variant="primary" size="sm" disabled={busy} onClick={onInstall}>
              {busy ? m.settings_plg_installing() : m.settings_plg_install()}
            </Button>
            <button
              onClick={onToggle}
              aria-label={expanded ? m.common_collapse() : m.common_expand()}
              className={
                'w-6 h-6 p-0 shrink-0 grid place-items-center rounded bg-transparent transition-colors hover:bg-white/[0.05] ' +
                (expanded ? 'text-accent' : 'text-zinc-500 hover:text-text-dim')
              }
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                className={'transition-transform ' + (expanded ? 'rotate-180' : '')}
              >
                <path
                  d="M2 4 L6 8 L10 4"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </div>
        {/* Reuse ROW_GRID so the description lines up under the title column
            with no hardcoded indent; the icon/action cells stay empty. */}
        {!expanded && (
          <div className={`${ROW_GRID} mt-1`}>
            <div />
            <div className="min-w-0 text-[12px] text-text-dim truncate">{entry.description}</div>
          </div>
        )}
      </div>

      {expanded && (
        <div className="px-3.5 pb-3.5 pt-1">
          <p className="text-[12.5px] text-text leading-[1.55] mb-3">{entry.description}</p>

          {shots.length > 0 && <ScreenshotGallery shots={shots} activeShot={activeShot} onSelectShot={onSelectShot} />}

          <div className="flex items-center gap-3.5 flex-wrap">
            {entry.homepage && (
              <a
                href={entry.homepage}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => {
                  e.preventDefault()
                  if (entry.homepage) window.api.openExternal(entry.homepage)
                }}
                className="inline-flex items-center gap-1.5 text-[11.5px] text-text-dim no-underline hover:text-accent"
              >
                <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
                  <path
                    d="M4 2 H2 V10 H10 V8 M7 2 H10 V5 M10 2 L5.5 6.5"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    fill="none"
                    strokeLinecap="round"
                  />
                </svg>
                {m.settings_plg_repo()}
              </a>
            )}
            <span className="text-zinc-500 font-mono text-[10.5px]">
              {m.settings_plg_requires({ version: entry.scalpelMinVersion })}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

export function PluginsSection({ onError, settings, update, tryHotkey }: Props): JSX.Element {
  const [registry, setRegistry] = useState<RegistrySnapshot | null>(null)
  const [registryError, setRegistryError] = useState<string | null>(null)
  const [installed, setInstalled] = useState<InstalledEntry[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [activeShot, setActiveShot] = useState(0)
  const [registeredHotkeys, setRegisteredHotkeys] = useState<
    Array<{ action: string; pluginId: string; label: string }>
  >([])

  const refreshAll = useCallback(async (): Promise<void> => {
    const [list, hotkeys] = await Promise.all([
      window.api.listInstalledPlugins(),
      window.api.pluginListRegisteredHotkeys(),
    ])
    setInstalled(list.map((p) => ({ manifest: p.manifest })))
    setRegisteredHotkeys(hotkeys)
  }, [])

  const refreshRegistry = async (): Promise<void> => {
    const r = await window.api.pluginFetchRegistry()
    if (r.ok) {
      setRegistry(r.snapshot)
      setRegistryError(null)
    } else {
      setRegistry(null)
      setRegistryError(r.error)
    }
  }

  useEffect(() => {
    void refreshAll()
    void refreshRegistry()
  }, [refreshAll])

  useEffect(() => {
    const offInstalled = window.api.onPluginInstalled(() => void refreshAll())
    const offUpdated = window.api.onPluginUpdated(() => void refreshAll())
    const offHotkeys = window.api.onPluginHotkeysChanged(() => void refreshAll())
    return () => {
      offInstalled()
      offUpdated()
      offHotkeys()
    }
  }, [refreshAll])

  const isInstalled = (id: string): boolean => installed.some((i) => i.manifest.id === id)

  const install = async (entry: RegistryEntry): Promise<void> => {
    setBusyId(entry.id)
    const r = await window.api.pluginInstallFromRegistry(entry)
    setBusyId(null)
    if (!r.ok) {
      onError(m.settings_plg_install_failed({ error: r.error }))
      return
    }
    onError(m.settings_plg_install_success({ name: entry.name }), 'warn')
    void refreshAll()
  }

  const doUpdate = async (entry: { id: string; name: string; newVersion: string }): Promise<void> => {
    setBusyId(entry.id)
    const r = await window.api.pluginUpdateFromRegistry(
      (registry?.plugins ?? []).find((e) => e.id === entry.id) as RegistryEntry,
    )
    setBusyId(null)
    if (!r.ok) {
      onError(m.settings_plg_update_failed({ error: r.error }))
      return
    }
    onError(m.settings_plg_update_success({ name: entry.name, version: entry.newVersion }), 'warn')
    void refreshAll()
  }

  const uninstall = async (pluginId: string, name: string): Promise<void> => {
    setBusyId(pluginId)
    const r = await window.api.pluginUninstall(pluginId)
    setBusyId(null)
    if (!r.ok) {
      onError(m.settings_plg_uninstall_failed({ error: r.error }))
      return
    }
    onError(m.settings_plg_uninstall_success({ name }), 'warn')
    void refreshAll()
  }

  const browseEntries = (registry?.plugins ?? []).filter((e) => !isInstalled(e.id))

  const toggleExpand = (id: string): void => {
    setExpandedId((cur) => (cur === id ? null : id))
    setActiveShot(0)
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2">
        <div className="settings-section-title mt-3">{m.settings_plg_installed_heading()}</div>
        {installed.length === 0 ? (
          <div className="text-xs text-zinc-500">{m.settings_plg_none_installed()}</div>
        ) : (
          <div className="flex flex-col gap-1">
            {installed.map(({ manifest }) => {
              const updateVersion = latestVersionFor(registry, manifest)
              return (
                <InstalledRow
                  key={manifest.id}
                  manifest={manifest}
                  iconUrlFallback={registry?.plugins?.find((e) => e.id === manifest.id)?.iconUrl}
                  busy={busyId === manifest.id}
                  onUninstall={() => void uninstall(manifest.id, manifest.name)}
                  updateVersion={updateVersion}
                  onUpdate={() => {
                    if (updateVersion)
                      void doUpdate({ id: manifest.id, name: manifest.name, newVersion: updateVersion })
                  }}
                  hotkeys={registeredHotkeys
                    .filter((h) => h.pluginId === manifest.id)
                    .map((h) => ({ action: h.action, label: h.label }))}
                  settings={settings}
                  update={update}
                  tryHotkey={tryHotkey}
                />
              )
            })}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="settings-section-title mt-3">{m.settings_plg_browse()}</div>
          <button onClick={() => void refreshRegistry()} className="text-[11px] text-text-dim hover:text-text">
            {m.common_refresh()}
          </button>
        </div>
        {registryError ? (
          <div className="text-xs text-red-400">{m.settings_plg_registry_unavailable({ error: registryError })}</div>
        ) : !registry ? (
          <div className="text-xs text-zinc-500">{m.common_loading()}</div>
        ) : browseEntries.length === 0 ? (
          <div className="text-xs text-zinc-500">{m.settings_plg_all_installed()}</div>
        ) : (
          <div className="flex flex-col gap-1">
            {browseEntries.map((entry) => (
              <BrowseRow
                key={entry.id}
                entry={entry}
                expanded={expandedId === entry.id}
                activeShot={expandedId === entry.id ? activeShot : 0}
                busy={busyId === entry.id}
                onToggle={() => toggleExpand(entry.id)}
                onInstall={() => void install(entry)}
                onSelectShot={setActiveShot}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
