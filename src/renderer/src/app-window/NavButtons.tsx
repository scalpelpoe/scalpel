export function NavButtons({
  onBack,
  onNext,
  nextLabel,
  nextDisabled,
  onExitSetup,
}: {
  onBack?: () => void
  onNext: () => void
  nextLabel?: string
  nextDisabled?: boolean
  onExitSetup?: () => void
}): JSX.Element {
  return (
    <div className="flex gap-[10px] mt-8">
      {onExitSetup && (
        <button onClick={onExitSetup} className="px-5 py-[10px] text-[12px] text-text-dim">
          Exit Setup
        </button>
      )}
      <div className="flex-1" />
      {onBack && (
        <button onClick={onBack} className="px-5 py-[10px] text-[13px]">
          Back
        </button>
      )}
      <button
        className={`primary px-6 py-[10px] text-[13px] font-semibold ${nextDisabled ? 'opacity-40 cursor-default' : 'cursor-pointer'}`}
        onClick={onNext}
        disabled={nextDisabled}
      >
        {nextLabel ?? 'Continue'}
      </button>
    </div>
  )
}
