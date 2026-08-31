import { Setting, CloseSmall, ChartHistogram, Flask, Buy, AllApplication, Search } from '@icon-park/react'
import type { HideableTabKey, OverlayData } from '@shared/types'
import type { GameFeatures } from '@shared/game-features'
import { getCurrencyIcons } from '../shared/icons'
import { DIV_CARD_ICON_URL, divCardArtMap, iconMap, IP } from '../shared/constants'
import dustIconAsset from '../assets/currency/thaumaturgic-dust.png'
import appIcon from '../../../../resources/icon.png'
import poereIcon from '../assets/other/poere-logo.svg'
import type { View } from './view'
import { m } from '@shared/paraglide/messages.js'

interface TitleBarProps {
  view: View
  overlayData: OverlayData | null
  poeVersion: 1 | 2 | null
  features: GameFeatures
  hasPriceCheckData: boolean
  hiddenTabs: Set<HideableTabKey>
  hiddenPluginTabIds: Set<string>
  pluginTabs: Array<{ pluginId: string; label: string; icon: string }>
  onSetView: (view: View | ((prev: View) => View)) => void
  onClose: () => void
  onMouseDown: (e: React.MouseEvent) => void
}

export function TitleBar({
  view,
  overlayData,
  poeVersion,
  features,
  hasPriceCheckData,
  hiddenTabs,
  hiddenPluginTabIds,
  pluginTabs,
  onSetView,
  onClose,
  onMouseDown,
}: TitleBarProps): JSX.Element {
  const fallbackIcon = getCurrencyIcons(poeVersion ?? 1).baseline
  const visiblePluginTabs = pluginTabs.filter((tab) => !hiddenPluginTabIds.has(tab.pluginId))

  // Row 1 fits 11 30px buttons at the fixed 540px panel: 512px of content
  // minus the brand block and its gap leaves ~415px, and 11 buttons at a
  // 36px pitch take 390px while 12 would take 426px. Plugin tabs fill the
  // slots the built-in buttons don't use; the rest wrap to a second row.
  const ROW_CAPACITY = 11
  const builtInCount = [
    view === 'tools',
    view === 'audit',
    true, // search is always rendered
    Boolean(overlayData) && !hiddenTabs.has('item'),
    !hiddenTabs.has('pricecheck'),
    features.dustExplorer && !hiddenTabs.has('dust'),
    features.divCards && !hiddenTabs.has('divcards'),
    features.regexTool && !hiddenTabs.has('regex'),
  ].filter(Boolean).length
  const rightCount = (hiddenTabs.has('extras') ? 0 : 1) + 2 // setup + close
  const pluginSlots = Math.max(0, ROW_CAPACITY - builtInCount - rightCount)
  const rowOnePluginTabs = visiblePluginTabs.slice(0, pluginSlots)
  const overflowPluginTabs = visiblePluginTabs.slice(pluginSlots)

  const renderPluginTab = (t: { pluginId: string; label: string; icon: string }): JSX.Element => {
    // Clamp every plugin-supplied SVG to the canonical 16x16 title-bar
    // size. The descendant selector picks up SVGs wrapped in any depth of
    // host element from the plugin's markup (iconpark output wraps its
    // svg in an outer span, for example). CSS wins over the SVG's
    // width/height attrs, so plugin authors don't need to set sizing.
    const base = 'btn-bounce w-[30px] h-[30px] flex items-center justify-center [&_svg]:w-4 [&_svg]:h-4 [&_svg]:block'
    const className = view === `plugin:${t.pluginId}` ? `${base} bg-accent text-[#171821]` : base
    return (
      <button
        key={t.pluginId}
        onClick={() => onSetView(`plugin:${t.pluginId}`)}
        title={t.label}
        className={className}
        dangerouslySetInnerHTML={{ __html: t.icon }}
      />
    )
  }

  return (
    <div className="px-3.5 py-2.5 border-b border-border cursor-grab" onMouseDown={onMouseDown}>
      <div className="flex items-center gap-3">
        <span className="text-accent font-bold tracking-[1px] flex shrink-0 items-center gap-1.5">
          <img src={appIcon} alt="" className="w-4 h-4" />
          {/* Name over version, both flush to the icon's right edge */}
          <span className="flex flex-col items-start leading-none">
            Scalpel
            <span className="text-[9px] font-medium tracking-normal opacity-60 mt-0.5">v{__APP_VERSION__}</span>
          </span>
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          {/* Tools tab -- only visible when active */}
          {view === 'tools' && (
            <button
              onClick={() => onSetView('tools')}
              title={m.feature_tools()}
              className="btn-bounce w-[30px] h-[30px] flex items-center justify-center bg-accent text-[#171821]"
            >
              <Flask size={16} {...IP} />
            </button>
          )}
          {/* Audit tab -- only visible when active. Procced by the audit-tier button in the
            filter editor or the openAudit hotkey, never user-toggleable. Click is a no-op
            re-affirm (matches Tools); navigation away clears it. */}
          {view === 'audit' && (
            <button
              onClick={() => onSetView('audit')}
              title={m.feature_price_audit()}
              className="btn-bounce w-[30px] h-[30px] flex items-center justify-center bg-accent text-[#171821]"
            >
              <ChartHistogram size={16} {...IP} />
            </button>
          )}
          {/* Search tab -- the one button that's always here, in the same slot, whether or
            not anything is copied. Opens the same view a dry-fired hotkey lands on. */}
          <button
            onClick={() => onSetView('no-item')}
            title={m.overlay_no_item_title()}
            className="btn-bounce w-[30px] h-[30px] flex items-center justify-center"
            style={{
              background: view === 'no-item' ? 'var(--accent)' : undefined,
              color: view === 'no-item' ? '#171821' : undefined,
            }}
          >
            <Search size={16} {...IP} />
          </button>
          {/* Item icon -- navigates back to the filter page. Nothing copied means no item
            art and nowhere to navigate, so the tab isn't rendered at all. */}
          {overlayData && !hiddenTabs.has('item') && (
            <button
              onClick={() => onSetView('item')}
              title={m.feature_filter_editor()}
              className="btn-bounce p-0.5 w-[30px] h-[30px] flex items-center justify-center"
              style={{
                background: view === 'item' ? 'var(--accent)' : undefined,
                color: view === 'item' ? '#171821' : undefined,
              }}
            >
              {(() => {
                const isDivCard = overlayData.item.itemClass === 'Divination Cards'
                const divArt = isDivCard
                  ? (divCardArtMap.get(overlayData.item.baseType) ?? divCardArtMap.get(overlayData.item.name))
                  : undefined
                const src = divArt
                  ? `https://web.poecdn.com/image/divination-card/${divArt}.png`
                  : (iconMap[overlayData.item.name] ?? iconMap[overlayData.item.baseType] ?? fallbackIcon)
                return (
                  <img
                    src={src}
                    alt=""
                    className="w-5 h-5 object-contain"
                    style={{
                      imageRendering: 'auto',
                      borderRadius: divArt ? 2 : 0,
                    }}
                  />
                )
              })()}
            </button>
          )}
          {!hiddenTabs.has('pricecheck') && (
            <button
              onClick={() => hasPriceCheckData && onSetView('pricecheck')}
              disabled={!hasPriceCheckData}
              title={hasPriceCheckData ? m.feature_price_checker() : m.titlebar_price_checker_empty()}
              className="btn-bounce w-[30px] h-[30px] flex items-center justify-center disabled:cursor-default"
              style={{
                background: view === 'pricecheck' ? 'var(--accent)' : undefined,
                color: view === 'pricecheck' ? '#171821' : undefined,
                opacity: hasPriceCheckData ? 1 : 0.35,
              }}
            >
              <Buy size={16} {...IP} />
            </button>
          )}
          {features.dustExplorer && !hiddenTabs.has('dust') && (
            <button
              onClick={() => onSetView('dust')}
              title={m.feature_dust_explorer()}
              className="btn-bounce w-[30px] h-[30px] flex items-center justify-center p-0.5"
              style={{
                background: view === 'dust' ? 'var(--accent)' : undefined,
              }}
            >
              <img src={dustIconAsset} alt="" className="w-[18px] h-[18px] object-contain" />
            </button>
          )}
          {features.divCards && !hiddenTabs.has('divcards') && (
            <button
              onClick={() => onSetView('divcards')}
              title={m.feature_div_card_explorer()}
              className="btn-bounce w-[30px] h-[30px] flex items-center justify-center p-0.5 text-[15px]"
              style={{
                background: view === 'divcards' ? 'var(--accent)' : undefined,
              }}
            >
              <img src={DIV_CARD_ICON_URL} alt="" className="w-[18px] h-[18px] object-contain" />
            </button>
          )}
          {features.regexTool && !hiddenTabs.has('regex') && (
            <button
              onClick={() => onSetView('regex')}
              title={m.feature_regex_tool()}
              className="btn-bounce w-[30px] h-[30px] flex items-center justify-center p-0.5"
              style={{
                background: view === 'regex' ? 'var(--accent)' : undefined,
              }}
            >
              <img
                src={poereIcon}
                alt=""
                className="w-[18px] h-[18px] object-contain"
                style={{ filter: view === 'regex' ? 'brightness(0.1)' : 'none' }}
              />
            </button>
          )}
          {rowOnePluginTabs.map(renderPluginTab)}
          {!hiddenTabs.has('extras') && (
            <button
              onClick={() => onSetView('extras')}
              title={m.feature_extra_features()}
              className="btn-bounce w-[30px] h-[30px] flex items-center justify-center"
              style={{
                background: view === 'extras' ? 'var(--accent)' : undefined,
                color: view === 'extras' ? '#171821' : undefined,
              }}
            >
              <AllApplication size={16} {...IP} />
            </button>
          )}
          <button
            onClick={() => onSetView('setup')}
            className="btn-bounce w-[30px] h-[30px] flex items-center justify-center"
            style={{
              background: view === 'setup' ? 'var(--accent)' : undefined,
              color: view === 'setup' ? '#171821' : undefined,
            }}
          >
            <Setting size={16} {...IP} />
          </button>
          <button
            onClick={onClose}
            aria-label="Close"
            className="btn-bounce btn-ghost w-[30px] h-[30px] flex items-center justify-center"
          >
            <CloseSmall size={16} {...IP} />
          </button>
        </div>
      </div>
      {overflowPluginTabs.length > 0 && (
        // pr-9 keeps the close button's 36px slot (30px button + 6px gap) clear,
        // so the wrapped row ends one slot short of the panel edge, under the gear.
        <nav aria-label="Plugin tabs" className="mt-1.5 flex flex-wrap items-center justify-end gap-1.5 pr-9">
          {overflowPluginTabs.map(renderPluginTab)}
        </nav>
      )}
    </div>
  )
}
