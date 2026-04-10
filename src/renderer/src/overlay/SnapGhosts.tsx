interface SnapGhostsProps {
  leftMountX: number
  rightMountX: number
  panelTop: number
  panelWidth: number
  panelHeight: number
  snapTarget: 'left' | 'right' | null
  overlayScale: number | undefined
}

export function SnapGhosts({
  leftMountX,
  rightMountX,
  panelTop,
  panelWidth,
  panelHeight,
  snapTarget,
  overlayScale,
}: SnapGhostsProps): JSX.Element {
  const scaleStyle = overlayScale && overlayScale !== 1 ? { transform: `scale(${overlayScale})` } : {}

  return (
    <>
      <div
        className="absolute pointer-events-none transition-opacity duration-150 ease-linear border-2 border-dashed border-white/35 bg-white/20"
        style={{
          top: panelTop,
          left: leftMountX,
          width: panelWidth,
          height: panelHeight,
          borderRadius: '0 10px 10px 0',
          opacity: snapTarget === 'left' ? 1 : 0,
          ...scaleStyle,
          ...(overlayScale && overlayScale !== 1 ? { transformOrigin: 'top left' } : {}),
        }}
      />
      <div
        className="absolute pointer-events-none transition-opacity duration-150 ease-linear border-2 border-dashed border-white/35 bg-white/20"
        style={{
          top: panelTop,
          left: rightMountX,
          width: panelWidth,
          height: panelHeight,
          borderRadius: '10px 0 0 10px',
          opacity: snapTarget === 'right' ? 1 : 0,
          ...scaleStyle,
          ...(overlayScale && overlayScale !== 1 ? { transformOrigin: 'top right' } : {}),
        }}
      />
    </>
  )
}
