import type { InputHTMLAttributes } from 'react'

interface SliderProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'type'> {
  /** Render full-width along its container. */
  fullWidth?: boolean
}

export function Slider({ fullWidth, ...rest }: SliderProps): JSX.Element {
  const className = ['range-thumb h-1 bg-bg-card rounded appearance-none cursor-pointer', fullWidth && 'w-full']
    .filter(Boolean)
    .join(' ')
  return <input {...rest} type="range" className={className} />
}
