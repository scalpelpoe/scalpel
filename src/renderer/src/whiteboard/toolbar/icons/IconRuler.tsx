import { IconBase, type BaseProps } from './IconBase'

export function IconRuler({ size }: BaseProps = {}): JSX.Element {
  return (
    <IconBase size={size}>
      <rect x="3" y="8" width="18" height="8" rx="1" />
      <path d="M7 8v3M11 8v4M15 8v3M19 8v4" />
    </IconBase>
  )
}
