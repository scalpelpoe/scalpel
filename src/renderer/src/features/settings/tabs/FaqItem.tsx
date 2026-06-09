export function FaqItem({ q, a }: { q: string; a: string }): JSX.Element {
  return (
    <div className="rounded-[6px] border border-border px-3 py-[10px] bg-black/20">
      <div className="text-xs font-semibold text-text mb-[6px]">{q}</div>
      <div className="text-[11px] text-text-dim leading-normal">{a}</div>
    </div>
  )
}
