/** Shimmer placeholder that mimics the shape of a content block while it loads.
 *  Size + shape come from the className (w-*, h-*, rounded-*). Use as many of these
 *  as needed to scaffold an async view -- reuse across async surfaces (trade results,
 *  sister-overlay prices, etc.). */
export function Skeleton({ className = '' }: { className?: string }): JSX.Element {
  return (
    <div className={`relative overflow-hidden bg-text-dim/10 ${className}`}>
      <div className="absolute inset-0 skeleton-shimmer" />
    </div>
  )
}
