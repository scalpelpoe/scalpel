import { History, Setting, CloseSmall, ChartHistogram, Flask, Buy } from '@icon-park/react'
import type { OverlayData } from '../../../shared/types'
import { chaosIcon } from '../shared/icons'
import { divCardArtMap, iconMap, IP } from '../shared/constants'
import dustIconAsset from '../assets/currency/thaumaturgic-dust.png'
import appIcon from '../../../../resources/icon.png'

type View =
  | 'idle'
  | 'item'
  | 'no-filter'
  | 'no-item'
  | 'setup'
  | 'history'
  | 'audit'
  | 'tools'
  | 'dust'
  | 'divcards'
  | 'pricecheck'

interface TitleBarProps {
  view: View
  overlayData: OverlayData | null
  onSetView: (view: View | ((prev: View) => View)) => void
  onClose: () => void
  onSetAuditBlockIndex: (v: number | null) => void
  onMouseDown: (e: React.MouseEvent) => void
}

export function TitleBar({
  view,
  overlayData,
  onSetView,
  onClose,
  onSetAuditBlockIndex,
  onMouseDown,
}: TitleBarProps): JSX.Element {
  return (
    <div
      className="flex items-center justify-between px-3.5 py-2.5 border-b border-border cursor-grab"
      onMouseDown={onMouseDown}
    >
      <span className="text-accent font-bold tracking-[1px] flex items-center gap-1.5">
        <img src={appIcon} alt="" className="w-4 h-4" />
        Scalpel
        <span className="text-[9px] text-accent font-medium opacity-60 self-end mb-px -ml-0.5">
          Beta {__APP_VERSION__}
        </span>
      </span>
      <div className="flex gap-1.5 items-center">
        {/* Tools tab -- only visible when active */}
        {view === 'tools' && (
          <button
            onClick={() => onSetView('tools')}
            title="Tools"
            className="w-[30px] h-[30px] flex items-center justify-center bg-accent text-[#171821]"
          >
            <Flask size={16} {...IP} />
          </button>
        )}
        {/* Item icon -- always navigates back to search results */}
        <button
          onClick={() => {
            if (overlayData) onSetView('item')
          }}
          title="Filter Editor"
          className="p-0.5 w-[30px] h-[30px] flex items-center justify-center"
          style={{
            background: view === 'item' ? 'var(--accent)' : undefined,
            color: view === 'item' ? '#171821' : undefined,
            opacity: overlayData ? 1 : 0.35,
            cursor: overlayData ? 'pointer' : 'default',
          }}
        >
          {(() => {
            const isDivCard = overlayData && overlayData.item.itemClass === 'Divination Cards'
            const divArt = isDivCard
              ? (divCardArtMap.get(overlayData.item.baseType) ?? divCardArtMap.get(overlayData.item.name))
              : undefined
            const src = divArt
              ? `https://web.poecdn.com/image/divination-card/${divArt}.png`
              : overlayData
                ? (iconMap[overlayData.item.name] ?? iconMap[overlayData.item.baseType] ?? chaosIcon)
                : chaosIcon
            return (
              <img
                src={src}
                alt=""
                className="w-5 h-5 object-cover"
                style={{
                  imageRendering: 'auto',
                  borderRadius: divArt ? 2 : 0,
                }}
              />
            )
          })()}
        </button>
        <button
          onClick={() => onSetView('pricecheck')}
          title="Price Checker"
          className="w-[30px] h-[30px] flex items-center justify-center"
          style={{
            background: view === 'pricecheck' ? 'var(--accent)' : undefined,
            color: view === 'pricecheck' ? '#171821' : undefined,
          }}
        >
          <Buy size={16} {...IP} />
        </button>
        {(() => {
          const auditMatch = overlayData?.matches.find((m) => m.isFirstMatch) ?? overlayData?.matches[0]
          const hasBaseTypes =
            auditMatch?.block.conditions.some((c) => c.type === 'BaseType' && c.values.length > 0) ?? false
          const tierStr = auditMatch?.block.tierTag?.tier ?? ''
          const isExTier = /^(ex\d*|exhide|exshow|2x\d*)$/.test(tierStr) || tierStr.startsWith('exotic')
          const canAudit = overlayData && hasBaseTypes && !isExTier
          return (
            <button
              onClick={() => {
                if (canAudit) {
                  onSetAuditBlockIndex(null)
                  onSetView('audit')
                }
              }}
              title={canAudit ? 'Price Audit' : 'No base types to audit'}
              className="w-[30px] h-[30px] flex items-center justify-center"
              style={{
                background: view === 'audit' ? 'var(--accent)' : undefined,
                color: view === 'audit' ? '#171821' : undefined,
                opacity: canAudit ? 1 : 0.35,
                cursor: canAudit ? 'pointer' : 'default',
              }}
            >
              <ChartHistogram size={16} {...IP} />
            </button>
          )
        })()}
        <button
          onClick={() => onSetView('dust')}
          title="Dust Explorer"
          className="w-[30px] h-[30px] flex items-center justify-center p-0.5"
          style={{
            background: view === 'dust' ? 'var(--accent)' : undefined,
          }}
        >
          <img src={dustIconAsset} alt="" className="w-[18px] h-[18px] object-contain" />
        </button>
        <button
          onClick={() => onSetView('divcards')}
          title="Div Card Explorer"
          className="w-[30px] h-[30px] flex items-center justify-center p-0.5 text-[15px]"
          style={{
            background: view === 'divcards' ? 'var(--accent)' : undefined,
          }}
        >
          <img
            src="https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvRGl2aW5hdGlvbi9JbnZlbnRvcnlJY29uIiwidyI6MSwiaCI6MSwic2NhbGUiOjF9XQ/f34bf8cbb5/InventoryIcon.png"
            alt=""
            className="w-[18px] h-[18px] object-contain"
          />
        </button>
        <button
          onClick={() => onSetView((v) => (v === 'history' ? 'idle' : 'history'))}
          title="Edit history"
          className="w-[30px] h-[30px] flex items-center justify-center"
          style={{
            background: view === 'history' ? 'var(--accent)' : undefined,
            color: view === 'history' ? '#171821' : undefined,
          }}
        >
          <History size={16} {...IP} />
        </button>
        <button
          onClick={() => onSetView('setup')}
          className="w-[30px] h-[30px] flex items-center justify-center"
          style={{
            background: view === 'setup' ? 'var(--accent)' : undefined,
            color: view === 'setup' ? '#171821' : undefined,
          }}
        >
          <Setting size={16} {...IP} />
        </button>
        <button onClick={onClose} className="w-[30px] h-[30px] flex items-center justify-center">
          <CloseSmall size={16} {...IP} />
        </button>
      </div>
    </div>
  )
}
