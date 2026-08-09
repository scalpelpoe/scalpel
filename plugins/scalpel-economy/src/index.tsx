import type { ScalpelPluginContext } from '@scalpelpoe/plugin-sdk'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { EconomyPanel } from './EconomyPanel'
import { ECONOMY_ICON } from './icon'

/** Sister-style width — narrow panel beside the game. */
const ECONOMY_WINDOW = { width: 280, height: 560 }

export default function activate(ctx: ScalpelPluginContext): void {
  if (ctx.getPoeVersion() !== 2) return

  ctx.registerTab({
    label: 'Economy',
    icon: ECONOMY_ICON,
    render(container) {
      const root = createRoot(container)
      root.render(<App ctx={ctx} />)
      return () => root.unmount()
    },
  })

  ctx.registerOverlay(
    {
      title: 'Scalpel Economy',
      icon: ECONOMY_ICON,
      hotkeyLabel: 'Toggle Scalpel Economy',
      defaultSize: ECONOMY_WINDOW,
    },
    (container) => {
      container.style.cssText =
        'box-sizing:border-box;height:100%;display:flex;flex-direction:column;overflow:hidden;background:#0c0c12;padding:8px'
      const root = createRoot(container)
      root.render(<EconomyPanel ctx={ctx} />)
      return () => root.unmount()
    },
  )

  void (async () => {
    const seen = await ctx.storage.get<boolean>('setupOpened')
    if (!seen) {
      await ctx.storage.set('setupOpened', true)
      ctx.openTab()
    }
  })()
}
