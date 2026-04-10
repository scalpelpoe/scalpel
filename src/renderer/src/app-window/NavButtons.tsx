export function NavButtons({
  onBack,
  onNext,
  nextLabel,
  nextDisabled,
}: {
  onBack?: () => void
  onNext: () => void
  nextLabel?: string
  nextDisabled?: boolean
}): JSX.Element {
  return (
    <div className="flex gap-[10px] mt-8">
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
