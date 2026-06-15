import { useEffect, useState } from 'react'
import type { AppSettings, HideableTabKey } from '@shared/types'
import { ScrubInput } from '@renderer/components/primitives/ScrubInput'
import { SettingToggleBox } from '@renderer/components/primitives/SettingToggleBox'
import { ThemeSettings } from './ThemeSettings'
import { Setting, CloseSmall, Buy, Filter, AllApplication } from '@icon-park/react'
import { getGameFeatures } from '@shared/game-features'
import { DIV_CARD_ICON_URL, IP } from '@renderer/shared/constants'
import dustIconAsset from '@renderer/assets/currency/thaumaturgic-dust.png'
import poereIcon from '@renderer/assets/other/poere-logo.svg'
import { m } from '@shared/paraglide/messages.js'

interface Props {
  settings: AppSettings
  update: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
  updateMany: (patch: Partial<AppSettings>) => void
}

const SCALE_PRESETS = [0.75, 1, 1.25, 1.5, 2] as const

const TAB_BUTTON_BASE = 'w-[30px] h-[30px] flex items-center justify-center'
// Three button states for the Show/Hide Tabs preview, communicated by fill color.
// Active = accent gold (matches the active state in the actual TitleBar buttons).
// Hidden = muted red. Ineligible = neutral grey for Settings/Close.
const TAB_FILL_ON = 'var(--accent)'
const TAB_FILL_OFF = 'rgba(239,83,80,0.85)'
const TAB_FILL_FIXED = 'rgba(255,255,255,0.12)'

export function ViewTab({ settings, update, updateMany }: Props): JSX.Element {
  // Custom scale mode is auto-enabled when the saved scale isn't one of the presets,
  // and toggled by the Custom/preset buttons otherwise.
  const [customScale, setCustomScale] = useState<boolean>(
    !(SCALE_PRESETS as readonly number[]).includes(settings.overlayScale),
  )

  // Show/Hide Tabs registry. Order matches the title bar (left-to-right). Features-gated
  // tabs only render if the current PoE version supports them, mirroring TitleBar
  // behavior -- if dust explorer isn't available for this game, there's nothing to toggle.
  const features = getGameFeatures(settings.poeVersion)
  const hidden = new Set<HideableTabKey>(settings.hiddenTabs ?? [])
  const toggleHidden = (key: HideableTabKey): void => {
    const next = new Set(hidden)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    update('hiddenTabs', [...next])
  }

  // Plugin-contributed tabs are dynamic, so they're fetched from the main-side
  // registry (works identically in the overlay and the standalone app window)
  // rather than hardcoded like the built-in tabs above.
  const [pluginTabs, setPluginTabs] = useState<Array<{ pluginId: string; label: string; icon: string }>>([])
  useEffect(() => {
    let alive = true
    const load = (): void => {
      void window.api.pluginListRegisteredTabs().then((tabs) => {
        if (alive) setPluginTabs(tabs)
      })
    }
    load()
    const off = window.api.onPluginTabsChanged(load)
    return () => {
      alive = false
      off()
    }
  }, [])

  const hiddenPlugins = new Set<string>(settings.hiddenPluginTabIds ?? [])
  const togglePluginHidden = (id: string): void => {
    const next = new Set(hiddenPlugins)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    update('hiddenPluginTabIds', [...next])
  }

  const TOGGLEABLE: Array<{ key: HideableTabKey; icon: React.ReactNode; title: string; show: boolean }> = [
    { key: 'item', icon: <Filter size={16} {...IP} />, title: m.feature_filter_editor(), show: true },
    { key: 'pricecheck', icon: <Buy size={16} {...IP} />, title: m.feature_price_checker(), show: true },
    {
      key: 'dust',
      icon: <img src={dustIconAsset} alt="" className="w-[18px] h-[18px] object-contain" />,
      title: m.feature_dust_explorer(),
      show: features.dustExplorer,
    },
    {
      key: 'divcards',
      icon: <img src={DIV_CARD_ICON_URL} alt="" className="w-[18px] h-[18px] object-contain" />,
      title: m.feature_div_card_explorer(),
      show: features.divCards,
    },
    {
      key: 'regex',
      icon: <img src={poereIcon} alt="" className="w-[18px] h-[18px] object-contain" />,
      title: m.feature_regex_tool(),
      show: features.regexTool,
    },
    { key: 'extras', icon: <AllApplication size={16} {...IP} />, title: m.feature_extra_features(), show: true },
  ]

  // Settings and Close get a grey border in the preview row -- they exist in the title
  // bar but the user can't hide them.
  const FIXED_PREVIEW: Array<{ icon: React.ReactNode; title: string }> = [
    { icon: <Setting size={16} {...IP} />, title: m.settings_tab_settings_always() },
    { icon: <CloseSmall size={16} {...IP} />, title: m.settings_tab_close_always() },
  ]

  return (
    <>
      <div className="settings-section-title mt-3">{m.settings_customize_view()}</div>

      <section>
        <label>{m.settings_show_hide_tabs()}</label>
        <div className="flex gap-1.5 mt-[6px] items-center">
          {TOGGLEABLE.filter((t) => t.show).map((t) => {
            const isHidden = hidden.has(t.key)
            // poere logo is a fixed-color SVG, so we darken it via a brightness filter
            // when the button is in the gold "on" state -- mirrors TitleBar.tsx behavior
            // for the regex tab so the logo stays legible against the gold background.
            const darkenPoere = t.key === 'regex' && !isHidden
            return (
              <button
                key={t.key}
                onClick={() => toggleHidden(t.key)}
                title={t.title}
                className={TAB_BUTTON_BASE}
                style={{
                  background: isHidden ? TAB_FILL_OFF : TAB_FILL_ON,
                  // Dark glyph on the gold "on" fill (matches active TitleBar look),
                  // white on the red "off" fill so the icon stays legible.
                  color: isHidden ? '#fff' : '#171821',
                  border: 'none',
                }}
              >
                <span style={darkenPoere ? { filter: 'brightness(0.1)', display: 'flex' } : undefined}>{t.icon}</span>
              </button>
            )
          })}
          {pluginTabs.map((t) => {
            const isHidden = hiddenPlugins.has(t.pluginId)
            return (
              <button
                key={t.pluginId}
                onClick={() => togglePluginHidden(t.pluginId)}
                title={t.label}
                className={`${TAB_BUTTON_BASE} [&_svg]:w-4 [&_svg]:h-4 [&_svg]:block`}
                style={{
                  background: isHidden ? TAB_FILL_OFF : TAB_FILL_ON,
                  color: isHidden ? '#fff' : '#171821',
                  border: 'none',
                }}
                dangerouslySetInnerHTML={{ __html: t.icon }}
              />
            )
          })}
          {FIXED_PREVIEW.map((b) => (
            <button
              key={b.title}
              disabled
              title={b.title}
              className={`${TAB_BUTTON_BASE} cursor-default`}
              style={{
                background: TAB_FILL_FIXED,
                color: 'var(--text-dim)',
                border: 'none',
              }}
            >
              {b.icon}
            </button>
          ))}
        </div>
      </section>

      {/* Overlay scale */}
      <section>
        <label>{m.settings_overlay_scale()}</label>
        <div className="flex items-center gap-1.5 mt-[6px]">
          {SCALE_PRESETS.map((scale) => (
            <button
              key={scale}
              onClick={() => {
                setCustomScale(false)
                update('overlayScale', scale)
              }}
              className={`text-[11px] px-3 py-1.5 ${
                !customScale && settings.overlayScale === scale ? 'bg-accent text-bg-solid' : 'text-text-dim'
              }`}
            >
              {Math.round(scale * 100)}%
            </button>
          ))}
          <button
            onClick={() => setCustomScale(true)}
            className={`text-[11px] px-3 py-1.5 ${customScale ? 'bg-accent text-bg-solid' : 'text-text-dim'}`}
          >
            {m.common_custom()}
          </button>
          {customScale && (
            <ScrubInput
              value={Math.round(settings.overlayScale * 100)}
              onChange={(v) => {
                if (v != null) update('overlayScale', v / 100)
              }}
              min={50}
              max={300}
              step={5}
              suffix="%"
            />
          )}
        </div>
      </section>

      {/* Open side (mount side at scan time; doesn't affect dragging) */}
      <section>
        <label>{m.settings_open_scalpel_on()}</label>
        <div className="flex gap-1.5 mt-[6px]">
          {(
            [
              ['both', m.settings_side_both()],
              ['right', m.settings_side_right()],
              ['left', m.settings_side_left()],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => update('openSide', value)}
              className={`text-[11px] px-3 py-1.5 ${
                (settings.openSide ?? 'both') === value ? 'bg-accent text-bg-solid' : 'text-text-dim'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {/* Close on click outside */}
      <SettingToggleBox
        label={m.settings_close_on_click_outside()}
        checked={settings.closeOnClickOutside}
        onChange={(val) => update('closeOnClickOutside', val)}
      />
      <SettingToggleBox
        label={m.settings_currency_names()}
        checked={settings.currencyLabelsAsText}
        onChange={(val) => update('currencyLabelsAsText', val)}
      />
      <ThemeSettings settings={settings} update={update} updateMany={updateMany} />
    </>
  )
}
