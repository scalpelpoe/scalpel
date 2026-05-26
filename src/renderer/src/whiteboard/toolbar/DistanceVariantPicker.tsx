import { useWhiteboardStore, type Tool } from '../state/store'
import { IconLine, IconRadius } from './icons'

const OPTIONS: Array<{ tool: Extract<Tool, 'ruler' | 'radiusRing'>; label: string; icon: JSX.Element }> = [
  { tool: 'radiusRing', label: 'Radius', icon: <IconRadius /> },
  { tool: 'ruler', label: 'Ruler (distance)', icon: <IconLine /> },
]

export function DistanceVariantPicker(): JSX.Element {
  const tool = useWhiteboardStore((s) => s.tool)
  const setTool = useWhiteboardStore((s) => s.setTool)
  return (
    <div className="flex gap-1 items-center px-1">
      {OPTIONS.map((o) => {
        const active = tool === o.tool
        return (
          <button
            key={o.tool}
            type="button"
            className={[
              'btn-ghost btn-bounce w-9 h-9 flex items-center justify-center',
              active ? 'text-text' : 'text-text-dim',
            ].join(' ')}
            onClick={() => setTool(o.tool)}
            title={o.label}
            aria-pressed={active}
          >
            {o.icon}
          </button>
        )
      })}
    </div>
  )
}
