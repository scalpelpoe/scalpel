import { useEffect, useState } from 'react'

export function SlideIn({
  stepKey,
  direction,
  children,
}: {
  stepKey: string
  direction: 'forward' | 'back'
  children: React.ReactNode
}): JSX.Element {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(frame)
  }, [])
  return (
    <div
      key={stepKey}
      style={{
        transform: mounted ? 'translateX(0)' : `translateX(${direction === 'forward' ? '60px' : '-60px'})`,
        opacity: mounted ? 1 : 0,
        transition: 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease',
      }}
    >
      {children}
    </div>
  )
}
