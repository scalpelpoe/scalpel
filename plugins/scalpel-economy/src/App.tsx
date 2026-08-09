import type { ScalpelPluginContext } from '@scalpelpoe/plugin-sdk'
import { Button } from '@scalpelpoe/plugin-sdk'
import { EconomyPanel } from './EconomyPanel'
import { useEconomyPrices } from './use-economy-prices'

interface AppProps {
  ctx: ScalpelPluginContext
}

export function App({ ctx }: AppProps): JSX.Element {
  const { refresh, loading } = useEconomyPrices(ctx)

  return (
    <div className="flex flex-col gap-4 p-4 text-text h-full min-h-0">
      <div>
        <h2 className="text-[15px] font-semibold text-text m-0">Scalpel Economy</h2>
        <p className="text-[12px] text-text-dim mt-1.5 mb-0 leading-relaxed">
          Live economy prices for Runes of Aldur. Pop out the overlay to keep prices beside PoE while you play.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => ctx.openOverlay()}>
          Open in-game panel
        </Button>
        <Button variant="secondary" disabled={loading} onClick={() => void refresh()}>
          {loading ? 'Refreshing…' : 'Refresh prices'}
        </Button>
      </div>

      <div className="flex-1 min-h-[280px] max-h-[420px]">
        <EconomyPanel ctx={ctx} compact />
      </div>

      <div className="text-[11px] text-text-dim leading-relaxed border-t border-white/10 pt-3">
        <strong className="text-text font-medium">Tips</strong>
        <ul className="mt-1.5 mb-0 pl-4 space-y-1">
          <li>Bind <span className="font-mono">Toggle Scalpel Economy</span> in Settings → Macros.</li>
          <li>Use the category dropdown for currency, runes, uniques, omens, and more.</li>
          <li>Each row shows the item icon and name beside its current price.</li>
        </ul>
      </div>
    </div>
  )
}
