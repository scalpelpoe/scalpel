import type { AppSettings, ProfileSettingKey, ProfileSettingValue, RuntimeSettings } from '@shared/types'
import { HotkeyField } from '../primitives/HotkeyField'
import type { HotkeySlot } from '../primitives/hotkey-collisions'
import { narrowScopeForCrossGameConflict } from '../primitives/hotkey-collisions'
import { appMacroEffectiveScope, scopeAppliesTo } from '@shared/macro-scope'
import { usePoeVersion } from '../../shared/poe-version-context'
import cheatSheetsArt from '../../assets/extra-features/cheat.png'
import regexRemoteArt from '../../assets/extra-features/remote.png'
import whiteboardArt from '../../assets/extra-features/whiteboard.png'
import pluginsArt from '../../assets/extra-features/Plugin.png'

interface Props {
  settings: RuntimeSettings
  /** Profile updates (cheat-sheet hotkey) flow back through here. */
  onSettingsChange: (s: RuntimeSettings) => void
  /** App-level setting writer (appMacros). Mirrors SettingsPanel's `update`. */
  update: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
  /** Shared hotkey collision guard. */
  tryHotkey: (hotkey: string, slot: HotkeySlot) => boolean
  /** Open the Settings panel focused on a specific sub-tab. */
  onOpenSettingsTab: (tab: string) => void
  /** Hide this tab (adds 'extras' to hiddenTabs) and navigate away. */
  onHideTab: () => void
}

type AppMacroAction = 'toggleRegexRemote' | 'toggleWhiteboard'

export function ExtraFeaturesPanel({
  settings,
  onSettingsChange,
  update,
  tryHotkey,
  onOpenSettingsTab,
  onHideTab,
}: Props): JSX.Element {
  const currentGame = usePoeVersion()
  const cheatSheets = settings.activeProfile?.cheatSheets ?? { globalHotkey: '', categories: [] }

  // Mirrors SettingsPanel.updateProfile: write the profile setting for the
  // active game, then lift the returned RuntimeSettings back to the parent.
  const updateProfile = async <K extends ProfileSettingKey>(key: K, value: ProfileSettingValue<K>): Promise<void> => {
    const variant = settings.poeVersion === 2 ? 2 : 1
    const updated = await window.api.setProfileSettingForGame(variant, key, value)
    onSettingsChange(updated)
  }

  // Find the appMacros index whose action matches and applies to the current
  // game (mirrors MacrosTab's visibleAppMacros filter). -1 when none exists.
  const findMacroIndex = (action: AppMacroAction): number =>
    (settings.appMacros ?? []).findIndex(
      (m) => m.action === action && scopeAppliesTo(appMacroEffectiveScope(m), currentGame),
    )

  // Read the current hotkey for an app-macro feature.
  const macroHotkey = (action: AppMacroAction): string => {
    const i = findMacroIndex(action)
    return i >= 0 ? ((settings.appMacros ?? [])[i]?.hotkey ?? '') : ''
  }

  // Write a hotkey for an app-macro feature: edit in place if a row exists,
  // otherwise append a new row. Identical collision + scope handling to MacrosTab.
  const setMacroHotkey = (action: AppMacroAction, hotkey: string): void => {
    const existing = findMacroIndex(action)
    const slotIndex = existing >= 0 ? existing : (settings.appMacros ?? []).length
    if (!tryHotkey(hotkey, { kind: 'appmacro', index: slotIndex })) return
    const scope = narrowScopeForCrossGameConflict(settings, hotkey, { kind: 'appmacro', index: slotIndex }, currentGame)
    const macros = [...(settings.appMacros ?? [])]
    if (existing >= 0) macros[existing] = { ...macros[existing], hotkey, scope }
    else macros.push({ action, hotkey, scope })
    update('appMacros', macros)
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 className="section-title">Additional Tools & Plugins</h2>
      </div>

      <FeatureCard
        icon={<img src={cheatSheetsArt} alt="" className="w-full h-full object-cover rounded" />}
        title="Cheat Sheets"
        blurb="Overlay level zone maps or your own reference images while you play."
        bgArt={cheatSheetsArt}
        bgArtOpacity={0.2}
        bgMaskImage="linear-gradient(to right, black 0%, black 33%, transparent 65%)"
      >
        <HotkeyField
          value={cheatSheets.globalHotkey}
          onChange={(hotkey) => {
            if (!tryHotkey(hotkey, { kind: 'cheatsheet-global' })) return
            void updateProfile('cheatSheets', { ...cheatSheets, globalHotkey: hotkey })
          }}
        />
        <CardLink label="Set up sheets in Settings" onClick={() => onOpenSettingsTab('cheatsheets')} />
      </FeatureCard>

      <FeatureCard
        icon={<img src={regexRemoteArt} alt="" className="w-full h-full object-cover rounded" />}
        title="Regex Remote"
        blurb="Pop a floating regex box next to a vendor or stash to copy your regex strings."
        bgArt={regexRemoteArt}
      >
        <HotkeyField
          value={macroHotkey('toggleRegexRemote')}
          onChange={(h) => setMacroHotkey('toggleRegexRemote', h)}
        />
      </FeatureCard>

      <FeatureCard
        icon={<img src={whiteboardArt} alt="" className="w-full h-full object-cover rounded" />}
        title="Whiteboard"
        blurb="Measure skill radius, make notes, or just draw a pretty picture on top of the game."
        bgArt={whiteboardArt}
      >
        <HotkeyField value={macroHotkey('toggleWhiteboard')} onChange={(h) => setMacroHotkey('toggleWhiteboard', h)} />
      </FeatureCard>

      <FeatureCard
        icon={<img src={pluginsArt} alt="" className="w-full h-full object-cover rounded" />}
        title="Plugins"
        blurb="Install community add-ons that extend Scalpel with extra tools."
        bgArt={pluginsArt}
      >
        <CardLink label="Browse & install in Settings" onClick={() => onOpenSettingsTab('plugins')} />
      </FeatureCard>

      <div className="bg-white/[0.04] rounded px-3 py-2 flex items-center justify-start gap-2">
        <button onClick={onHideTab} className="text-[11px] text-text-dim px-3 py-1.5">
          Hide this tab
        </button>
        <span className="text-[10px] text-text-dim opacity-70">You can re-enable this from Settings &gt; View.</span>
      </div>
    </div>
  )
}

function FeatureCard({
  icon,
  title,
  blurb,
  bgArt,
  bgArtOpacity = 0.34,
  bgMaskImage = 'linear-gradient(to right, black 0%, black 33%, transparent 75%)',
  children,
}: {
  icon: React.ReactNode
  title: string
  blurb: string
  /** Optional decorative art that bleeds off the left/top/bottom edges of the
   *  card and fades out toward the right (masked) so it never obscures the text. */
  bgArt?: string
  /** Per-card override for the bleed-art opacity. Defaults to the shared 0.34. */
  bgArtOpacity?: number
  bgMaskImage?: string
  children: React.ReactNode
}): JSX.Element {
  return (
    <div data-feature-card className="relative overflow-hidden bg-white/[0.04] rounded p-3 flex flex-col gap-2.5">
      {bgArt && (
        <img
          src={bgArt}
          alt=""
          aria-hidden
          className="pointer-events-none select-none absolute left-[-15%] top-1/2 -translate-y-1/2 h-[170%] w-auto max-w-none"
          style={{
            opacity: bgArtOpacity,
            filter: 'blur(2px)',
            WebkitMaskImage: bgMaskImage,
            maskImage: bgMaskImage,
          }}
        />
      )}
      <div className="relative z-[1] grid grid-cols-[40px_1fr] gap-3 items-start">
        <div className="w-10 h-10 flex items-center justify-center rounded bg-black/20 text-accent overflow-hidden">
          {icon}
        </div>
        <div className="flex flex-col gap-0.5 min-w-0">
          <div className="text-[13px] font-semibold">{title}</div>
          <div className="text-[11px] text-text-dim leading-snug">{blurb}</div>
        </div>
      </div>
      <div className="relative z-[1] flex flex-col gap-2">{children}</div>
    </div>
  )
}

function CardLink({ label, onClick }: { label: string; onClick: () => void }): JSX.Element {
  return (
    <button onClick={onClick} className="text-[11px] text-accent self-start px-3 py-1.5">
      {label}
    </button>
  )
}
