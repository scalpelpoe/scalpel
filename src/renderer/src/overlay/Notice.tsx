import type { ReactNode } from 'react'

export function Notice({
  icon,
  title,
  body,
  action,
}: {
  icon: ReactNode
  title: string
  body: string
  action?: { label: string; onClick: () => void }
}): JSX.Element {
  return (
    <div className="p-6 text-center text-text-dim">
      <div className="text-[32px] mb-3 flex justify-center">{icon}</div>
      <div className="text-text font-semibold mb-1.5">{title}</div>
      <div className="text-xs">{body}</div>
      {action && (
        <button className="primary mt-4 px-5 py-[8px] text-[12px] font-semibold" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  )
}
