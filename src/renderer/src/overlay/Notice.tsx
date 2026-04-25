import type { ReactNode } from 'react'

export function Notice({ icon, title, body }: { icon: ReactNode; title: string; body: string }): JSX.Element {
  return (
    <div className="p-6 text-center text-text-dim">
      <div className="text-[32px] mb-3 flex justify-center">{icon}</div>
      <div className="text-text font-semibold mb-1.5">{title}</div>
      <div className="text-xs">{body}</div>
    </div>
  )
}
