import { m } from '@shared/paraglide/messages.js'

export function NavButtons({
  onBack,
  onNext,
  nextLabel,
  nextDisabled,
  secondaryLabel,
  onSecondary,
  onBackToSettings,
}: {
  onBack?: () => void
  onNext: () => void
  nextLabel?: string
  nextDisabled?: boolean
  secondaryLabel?: string
  onSecondary?: () => void
  onBackToSettings?: () => void
}): JSX.Element {
  return (
    <div className="flex gap-[10px] mt-8">
      {onBackToSettings && (
        <button onClick={onBackToSettings} className="px-5 py-[10px] text-[12px] text-text-dim">
          {m.onb_back_to_settings()}
        </button>
      )}
      <div className="flex-1" />
      {onBack && (
        <button onClick={onBack} className="px-5 py-[10px] text-[13px]">
          {m.common_back()}
        </button>
      )}
      {onSecondary && (
        <button onClick={onSecondary} className="px-5 py-[10px] text-[13px]">
          {secondaryLabel ?? m.common_skip()}
        </button>
      )}
      <button
        className={`primary px-6 py-[10px] text-[13px] font-semibold ${nextDisabled ? 'opacity-40 cursor-default' : 'cursor-pointer'}`}
        onClick={onNext}
        disabled={nextDisabled}
      >
        {nextLabel ?? m.common_continue()}
      </button>
    </div>
  )
}
