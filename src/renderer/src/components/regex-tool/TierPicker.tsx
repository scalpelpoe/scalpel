import itemIcons from '../../../../shared/data/items/item-icons.json'
import { FilterChip } from '../price-check/FilterChip'

const icons = itemIcons as Record<string, string>

interface TierButtonProps {
  icon: string
  size: number
  title: string
  disabled?: boolean
  onClick: () => void
}

/** Square icon button used in the tier strip (T1..T16 + Nightmare + Originator). Local
 *  to TierPicker since nothing else in the app renders tier icons. */
function TierButton({ icon, size, title, disabled, onClick }: TierButtonProps): JSX.Element {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center border-none cursor-pointer disabled:opacity-30"
      style={{
        background: 'rgba(255,255,255,0.05)',
        borderRadius: 3,
        padding: size > 30 ? '3px 3px 2px' : '2px 2px 1px',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'rgba(255,255,255,0.12)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
      }}
      title={title}
    >
      <img src={icon} alt={title} style={{ width: size, height: size, objectFit: 'contain' }} />
    </button>
  )
}

/** Tier icons for regular maps + Nightmare. Keyed by tier (1-16) or the string 'nightmare'. */
export const MAP_TIER_ICONS: Record<number | string, string> = Object.fromEntries([
  ...Array.from({ length: 16 }, (_, i) => [i + 1, icons[`Map (Tier ${i + 1})`]]),
  ['nightmare', icons['Nightmare Map']],
])

/** Zana / Originator-variant icons. Keyed by tier only -- no nightmare variant. */
export const ORIGINATOR_TIER_ICONS: Record<number, string> = Object.fromEntries(
  Array.from({ length: 16 }, (_, i) => [i + 1, icons[`Zana Map (Tier ${i + 1})`]]),
)

interface TierPickerProps {
  /** Reveals the picker when either toggle is on -- matched because the parent uses the
   *  same animation for both the user-pressed picker and the trade-results panel. */
  showTierPicker: boolean
  showTradeResults: boolean
  /** Whether the T1-T13 row is visible. The parent retains this so it persists across
   *  trade-results toggles. */
  showAllTiers: boolean
  setShowAllTiers: React.Dispatch<React.SetStateAction<boolean>>
  /** Map-type filter chips above the tier row. */
  tradeOriginator: boolean
  setTradeOriginator: React.Dispatch<React.SetStateAction<boolean>>
  tradeCorrupted8mod: boolean
  setTradeCorrupted8mod: React.Dispatch<React.SetStateAction<boolean>>
  /** When the user's regex includes a nightmare-only mod, only T14-T16 + Nightmare render. */
  hasNightmareMod: boolean
  /** Disables the tier buttons while a search is in flight or the regex is empty. */
  tradeSearching: boolean
  regex: string
  /** Which icon set to use for T1..T16 -- the parent decides based on the Originator
   *  chip and qualifier hints. */
  tierIcons: Record<number | string, string>
  /** Fires the trade search. `nightmare=true` means the user picked the Nightmare Map
   *  variant (tier is always 16 in that case). */
  searchMapTrade: (tier: number, nightmare: boolean) => void | Promise<void>
}

/** Slide-down strip with Originator / 8-mod chips and the tier icon row. Appears when
 *  the user clicks the "Trade search" pill in the generator header. */
export function TierPicker({
  showTierPicker,
  showTradeResults,
  showAllTiers,
  setShowAllTiers,
  tradeOriginator,
  setTradeOriginator,
  tradeCorrupted8mod,
  setTradeCorrupted8mod,
  hasNightmareMod,
  tradeSearching,
  regex,
  tierIcons,
  searchMapTrade,
}: TierPickerProps): JSX.Element {
  const open = showTierPicker || showTradeResults
  const disabled = tradeSearching || !regex

  return (
    <div
      className="overflow-hidden transition-all duration-150"
      style={{
        maxHeight: open ? 150 : 0,
        opacity: open ? 1 : 0,
        margin: open ? '8px -12px 0' : '0',
        padding: open ? '0 12px' : '0',
        borderTop: '1px solid var(--border)',
        paddingTop: open ? 8 : 0,
      }}
    >
      <div className="flex gap-[4px] mb-[4px]">
        <FilterChip
          label="Originator"
          active={tradeOriginator}
          onClick={() => setTradeOriginator((v) => !v)}
          color="#dddddd"
        />
        <FilterChip
          label="8-mod Corrupted"
          active={tradeCorrupted8mod}
          onClick={() => setTradeCorrupted8mod((v) => !v)}
          color="#ef5350"
        />
      </div>
      {hasNightmareMod ? (
        <div className="flex gap-[4px] items-center">
          {[14, 15, 16].map((t) => (
            <TierButton
              key={t}
              icon={ORIGINATOR_TIER_ICONS[t]}
              size={38}
              title={`Originator Tier ${t}`}
              disabled={disabled}
              onClick={() => searchMapTrade(t, false)}
            />
          ))}
          <TierButton
            icon={MAP_TIER_ICONS.nightmare}
            size={38}
            title="Nightmare"
            disabled={disabled}
            onClick={() => searchMapTrade(16, true)}
          />
        </div>
      ) : (
        <>
          {/* T1-T13 expandable row. */}
          <div
            className="overflow-hidden transition-all duration-150"
            style={{ maxHeight: showAllTiers ? 50 : 0, marginBottom: showAllTiers ? 4 : 0 }}
          >
            <div className="flex gap-[3px] flex-wrap">
              {Array.from({ length: 13 }, (_, i) => i + 1).map((t) => (
                <TierButton
                  key={t}
                  icon={tierIcons[t]}
                  size={26}
                  title={`Tier ${t}`}
                  disabled={disabled}
                  onClick={() => searchMapTrade(t, false)}
                />
              ))}
            </div>
          </div>
          {/* All-tiers toggle + T14-T16 + Nightmare (always visible). */}
          <div className="flex gap-[4px] items-center">
            <button
              onClick={() => setShowAllTiers((v) => !v)}
              className="flex items-center justify-center border-none cursor-pointer"
              style={{
                background: showAllTiers ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)',
                borderRadius: 3,
                padding: '3px 3px 2px',
                width: 44,
                height: 44,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.12)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = showAllTiers ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)'
              }}
              title="Show all tiers"
            >
              <span className="text-[9px] font-semibold text-text-dim leading-tight text-center">
                All
                <br />
                tiers
              </span>
            </button>
            {[14, 15, 16].map((t) => (
              <TierButton
                key={t}
                icon={tierIcons[t]}
                size={38}
                title={`Tier ${t}`}
                disabled={disabled}
                onClick={() => searchMapTrade(t, false)}
              />
            ))}
            <TierButton
              icon={MAP_TIER_ICONS.nightmare}
              size={38}
              title="Nightmare"
              disabled={disabled}
              onClick={() => searchMapTrade(16, true)}
            />
          </div>
        </>
      )}
    </div>
  )
}
