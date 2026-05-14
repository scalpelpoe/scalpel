import type { LabelHTMLAttributes, ReactNode } from 'react'

interface LabelProps extends Omit<LabelHTMLAttributes<HTMLLabelElement>, 'className'> {
  children: ReactNode
}

export function Label({ children, ...rest }: LabelProps): JSX.Element {
  return (
    <label {...rest} className="block text-[11px] text-text-dim mb-1">
      {children}
    </label>
  )
}
