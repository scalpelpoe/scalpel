interface IconGlowProps {
  src: string
  size: number
  glow?: number
  blur?: number
  saturate?: number
  opacity?: number
  className?: string
  /** Override glow width/height independently (e.g. non-square glows) */
  glowWidth?: number
  glowHeight?: number
  /** CSS object-fit for the sharp image (default 'contain') */
  objectFit?: 'contain' | 'cover'
  /** Alt text for the sharp image */
  alt?: string
  /** Additional style on the sharp image */
  imgStyle?: React.CSSProperties
  /** Height override for the sharp image (when different from size) */
  height?: number
}

export function IconGlow({
  src,
  size,
  glow = 2,
  blur = 12,
  saturate = 1.8,
  opacity = 0.5,
  className = '',
  glowWidth,
  glowHeight,
  objectFit = 'contain',
  alt = '',
  imgStyle,
  height,
}: IconGlowProps): JSX.Element {
  const sharpW = size
  const sharpH = height ?? size
  const gw = glowWidth ?? sharpW * glow
  const gh = glowHeight ?? sharpH * glow
  return (
    <div
      className={`relative shrink-0 flex items-center justify-center ${className}`}
      style={{ width: sharpW, height: sharpH }}
    >
      <img
        src={src}
        alt=""
        aria-hidden="true"
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
        style={{
          width: gw,
          height: gh,
          objectFit,
          filter: `blur(${blur}px) saturate(${saturate})`,
          opacity,
        }}
      />
      <img
        src={src}
        alt={alt}
        className="relative"
        style={{
          width: sharpW,
          height: sharpH,
          objectFit,
          ...imgStyle,
        }}
      />
    </div>
  )
}
