import type { TextareaHTMLAttributes } from 'react'

interface TextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className'> {
  fullWidth?: boolean
}

export function Textarea({ fullWidth, rows = 3, ...rest }: TextareaProps): JSX.Element {
  const className = [
    'bg-bg-card text-text border border-border rounded px-2 py-1 text-xs',
    'placeholder:text-text-dim focus:outline-none focus:border-accent',
    'resize-y',
    fullWidth && 'w-full',
  ]
    .filter(Boolean)
    .join(' ')
  return <textarea {...rest} rows={rows} className={className} />
}
