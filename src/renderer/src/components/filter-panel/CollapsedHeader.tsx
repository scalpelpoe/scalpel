import { SaveButton } from './SaveButton'
import { IconGlow } from '../../shared/IconGlow'

interface CollapsedHeaderProps {
  collapsed: boolean
  iconUrl: string | null
  itemName: string
  baseType: string
  rarityColor: string
  isDirty: boolean
  isSaving: boolean
  isSaved: boolean
  onSave: () => void
}

export function CollapsedHeader({
  collapsed,
  iconUrl,
  itemName,
  baseType,
  rarityColor,
  isDirty,
  isSaving,
  isSaved,
  onSave,
}: CollapsedHeaderProps): JSX.Element {
  return (
    <div
      className="absolute top-0 left-0 right-0 z-[2] flex items-center gap-2 px-3 py-2 bg-bg-solid border-b border-border transition-[transform,opacity] duration-200 ease-out"
      style={{
        transform: collapsed ? 'translateY(0)' : 'translateY(-100%)',
        opacity: collapsed ? 1 : 0,
        pointerEvents: collapsed ? 'auto' : 'none',
      }}
    >
      {iconUrl && <IconGlow src={iconUrl} size={22} blur={10} />}
      <span
        className="font-semibold text-[12px] flex-1 overflow-hidden text-ellipsis whitespace-nowrap relative z-[1]"
        style={{ color: rarityColor }}
      >
        {itemName !== baseType ? itemName : baseType}
      </span>
      <SaveButton isDirty={isDirty} isSaving={isSaving} isSaved={isSaved} onSave={onSave} compact />
    </div>
  )
}
