import type { InputHTMLAttributes } from 'react'

interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> {
  /** Full-width input. Defaults to inline-sized. */
  fullWidth?: boolean
}

export function TextInput({ fullWidth, ...rest }: TextInputProps): JSX.Element {
  const className = [
    'bg-bg-card text-text border border-border rounded px-2 py-1 text-xs',
    'placeholder:text-text-dim focus:outline-none focus:border-accent',
    fullWidth && 'w-full',
  ]
    .filter(Boolean)
    .join(' ')
  return <input {...rest} className={className} />
}
