import { iconMap, divCardArtMap } from '../shared/constants'

interface Props {
  name: string
  itemClass?: string
  onClick?: () => void
  title?: string
}

function getChipIcon(name: string, itemClass?: string): { url: string; isDivCard: boolean } | null {
  const isDivCard = itemClass === 'Divination Cards'
  if (isDivCard) {
    const art = divCardArtMap.get(name)
    if (art) return { url: `https://web.poecdn.com/image/divination-card/${art}.png`, isDivCard: true }
  }
  // Check if name matches a div card even without explicit itemClass
  const art = divCardArtMap.get(name)
  if (art) return { url: `https://web.poecdn.com/image/divination-card/${art}.png`, isDivCard: true }
  const icon = iconMap[name]
  if (icon) return { url: icon, isDivCard: false }
  return null
}

export function ItemChip({ name, itemClass, onClick, title }: Props): JSX.Element {
  const icon = getChipIcon(name, itemClass)
  const isDivCard = icon?.isDivCard ?? false

  return (
    <span
      onClick={onClick}
      className="text-white inline-flex items-center rounded text-[11px] leading-none transition-[background] duration-100 relative overflow-hidden"
      style={{
        cursor: onClick ? 'pointer' : 'default',
        gap: isDivCard ? 6 : 4,
        background: 'rgba(40, 60, 90, 0.6)',
        padding: isDivCard ? '0 8px 0 0' : '3px 8px',
      }}
      onMouseEnter={(e) => {
        if (!onClick) return
        e.currentTarget.style.background = 'rgba(45, 70, 105, 0.7)'
        const glow = e.currentTarget.querySelector('.chip-glow') as HTMLElement | null
        if (glow) {
          glow.style.opacity = '0.6'
          glow.style.transform = 'translateY(-50%) scale(1.15)'
        }
      }}
      onMouseLeave={(e) => {
        if (!onClick) return
        e.currentTarget.style.background = 'rgba(40, 60, 90, 0.6)'
        const glow = e.currentTarget.querySelector('.chip-glow') as HTMLElement | null
        if (glow) {
          glow.style.opacity = '0.45'
          glow.style.transform = 'translateY(-50%) scale(1)'
        }
      }}
      title={title}
    >
      {icon && !isDivCard && (
        <img
          src={icon.url}
          alt=""
          className="chip-glow absolute -left-3 top-1/2 -translate-y-1/2 w-20 h-20 object-contain pointer-events-none transition-[opacity,transform] duration-200"
          style={{
            filter: 'blur(14px) saturate(3)',
            opacity: 0.45,
          }}
        />
      )}
      {icon &&
        (isDivCard ? (
          <img src={icon.url} alt="" className="self-stretch w-7 object-cover relative z-[1] rounded-l-[3px]" />
        ) : (
          <img src={icon.url} alt="" className="w-3.5 h-3.5 object-contain relative z-[1]" />
        ))}
      <span className="relative z-[1] leading-none">{name}</span>
    </span>
  )
}
