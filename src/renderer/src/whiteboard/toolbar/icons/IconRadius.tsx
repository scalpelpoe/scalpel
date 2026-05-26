import { IconBase, type BaseProps } from './IconBase'

export function IconRadius({ size }: BaseProps = {}): JSX.Element {
  return (
    <IconBase size={size}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 12L20 12" />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" />
    </IconBase>
  )
}
