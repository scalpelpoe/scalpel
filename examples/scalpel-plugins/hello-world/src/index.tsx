import { createRoot, type Root } from 'react-dom/client'
import { useEffect, useState } from 'react'
import {
  isClusterJewel,
  formatPrice,
  RARITY_COLORS,
  useCurrentZone,
  Toggle,
  Notice,
  type ScalpelPluginContext,
  type PoeItem,
} from '@filterscalpel/plugin-sdk'

const ICON_SVG = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>`

const COUNT_KEY = 'hotkeyPressCount'

function HelloPanel({
  ctx,
  initialCount,
  registerSetter,
}: {
  ctx: ScalpelPluginContext
  initialCount: number
  registerSetter: (setter: ((n: number) => void) | null) => void
}): JSX.Element {
  const [item, setItem] = useState<PoeItem | null>(ctx.getCurrentItem() as PoeItem | null)
  const [count, setCount] = useState(initialCount)
  const [showDebug, setShowDebug] = useState(false)
  const zone = useCurrentZone()

  useEffect(() => ctx.onCurrentItem((i) => setItem(i as PoeItem | null)), [ctx])

  useEffect(() => {
    registerSetter(setCount)
    return () => registerSetter(null)
  }, [registerSetter])

  const reset = (): void => {
    setCount(0)
    void ctx.storage.set(COUNT_KEY, 0)
  }

  return (
    <div style={{ padding: 16, color: 'var(--text, #eee)', fontSize: 12 }}>
      <h2 style={{ fontSize: 14, marginBottom: 8 }}>Hello from a plugin!</h2>
      <div style={{ opacity: 0.7 }}>PoE version: {ctx.getPoeVersion()}</div>
      <div style={{ opacity: 0.7 }}>League: {ctx.getLeague()}</div>
      <div style={{ marginTop: 12 }}>
        Current item: {item ? (item.name || item.baseType) : '(none)'}
      </div>
      <div style={{ marginTop: 4, opacity: 0.7 }}>
        Cluster jewel?{' '}
        {item && isClusterJewel(item) ? 'yes' : 'no'}
      </div>
      <div style={{ marginTop: 4, opacity: 0.7 }}>
        Demo formatPrice(1500): {formatPrice(1500)}
      </div>
      <div style={{ marginTop: 4, opacity: 0.7 }}>
        Current zone:{' '}
        <span style={{ color: RARITY_COLORS.Unique }}>{zone?.areaCode ?? '(no zone yet)'}</span>
      </div>
      <div
        style={{
          marginTop: 16,
          padding: 8,
          background: 'rgba(255,255,255,0.05)',
          borderRadius: 4,
        }}
      >
        <div style={{ fontWeight: 'bold', marginBottom: 4 }}>Hotkey demo</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Toggle checked={showDebug} onChange={setShowDebug} />
            <span style={{ fontSize: 11 }}>Show debug info</span>
          </div>
          {showDebug && (
            <Notice
              icon={<span>i</span>}
              title="Debug"
              body={`PoE ${ctx.getPoeVersion()}, league ${ctx.getLeague()}`}
            />
          )}
        <div style={{ opacity: 0.7, marginBottom: 8 }}>
          Bind a key for "Hello World: Increment counter" in Settings &gt; Macros, then press it.
          The count is persisted via ctx.storage and survives Scalpel restarts.
        </div>
        <div>
          Presses: <strong>{count}</strong>
        </div>
        <button
          onClick={reset}
          style={{
            marginTop: 8,
            padding: '4px 8px',
            fontSize: 11,
            background: 'rgba(255,255,255,0.1)',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 3,
            color: 'inherit',
            cursor: 'pointer',
          }}
        >
          Reset
        </button>
      </div>
    </div>
  )
}

let root: Root | null = null

export default async function activate(ctx: ScalpelPluginContext): Promise<void> {
  ctx.log('hello-world activated')

  // Load persisted counter once at activation. The hotkey handler holds the
  // authoritative value; the React tree's setCount is registered via a setter
  // hook so the handler can push updates without forcing a re-mount.
  let count = ((await ctx.storage.get<number>(COUNT_KEY)) ?? 0) as number
  let pushToUI: ((n: number) => void) | null = null

  ctx.registerHotkey({ label: 'Increment counter' }, () => {
    count += 1
    void ctx.storage.set(COUNT_KEY, count)
    pushToUI?.(count)
  })

  ctx.registerTab({
    label: 'Hello World',
    icon: ICON_SVG,
    render: (container) => {
      root = createRoot(container)
      root.render(
        <HelloPanel
          ctx={ctx}
          initialCount={count}
          registerSetter={(setter) => {
            pushToUI = setter
          }}
        />,
      )
      return () => {
        root?.unmount()
        root = null
        pushToUI = null
      }
    },
  })
}
