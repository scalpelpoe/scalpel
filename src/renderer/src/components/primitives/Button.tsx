import type { ReactNode, ButtonHTMLAttributes } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'
type ButtonSize = 'sm' | 'md'

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Render an icon-only button. Children should be the icon element. */
  iconOnly?: boolean
  children?: ReactNode
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-bg-solid hover:opacity-90',
  secondary: 'bg-zinc-700 hover:bg-zinc-600 text-text',
  danger: 'bg-red-700 hover:bg-red-600 text-white',
  ghost: 'bg-transparent hover:bg-white/5 text-text-dim hover:text-text',
}

const SIZES: Record<ButtonSize, string> = {
  sm: 'text-[11px] px-2 py-1 rounded',
  md: 'text-xs px-3 py-1.5 rounded',
}

const ICON_SIZES: Record<ButtonSize, string> = {
  sm: 'w-5 h-5 rounded',
  md: 'w-7 h-7 rounded',
}

export function Button({
  variant = 'secondary',
  size = 'md',
  iconOnly,
  disabled,
  children,
  ...rest
}: ButtonProps): JSX.Element {
  const sizeCls = iconOnly ? ICON_SIZES[size] : SIZES[size]
  const className = [
    'btn-bounce inline-flex items-center justify-center gap-1.5 transition-colors',
    VARIANTS[variant],
    sizeCls,
    disabled && 'opacity-50 cursor-not-allowed',
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <button {...rest} disabled={disabled} className={className}>
      {children}
    </button>
  )
}
