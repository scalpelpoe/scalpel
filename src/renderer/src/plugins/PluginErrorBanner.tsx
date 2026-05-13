import { CloseSmall, Caution } from '@icon-park/react'
import { IP } from '../shared/constants'

export interface BrokenPlugin {
  id: string
  message: string
}

interface Props {
  broken: BrokenPlugin[]
  onDismiss: (id: string) => void
}

export function PluginErrorBanner({ broken, onDismiss }: Props): JSX.Element | null {
  if (broken.length === 0) return null
  return (
    <div className="flex flex-col gap-1 px-3 py-2 border-b border-border bg-bg">
      {broken.map((b) => (
        <div key={b.id} className="flex items-center gap-2 text-xs text-red-400">
          <Caution size={14} {...IP} />
          <span className="flex-1 truncate">
            Plugin <strong>{b.id}</strong> crashed: {b.message}
          </span>
          <button
            onClick={() => onDismiss(b.id)}
            className="btn-bounce w-[20px] h-[20px] flex items-center justify-center opacity-70 hover:opacity-100"
            title="Dismiss"
          >
            <CloseSmall size={12} {...IP} />
          </button>
        </div>
      ))}
    </div>
  )
}
