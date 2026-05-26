import { IconBase, type BaseProps } from './IconBase'

export function IconLine({ size }: BaseProps = {}): JSX.Element {
  return (
    <IconBase size={size}>
      <path d="M5 19L19 5" />
    </IconBase>
  )
}
