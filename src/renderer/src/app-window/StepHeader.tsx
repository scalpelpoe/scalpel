export function StepHeader({
  title,
  subtitle,
  stepNum,
  totalSteps,
}: {
  title: string
  subtitle: string
  stepNum?: number
  totalSteps?: number
}): JSX.Element {
  return (
    <div className="mb-7">
      {stepNum != null && totalSteps != null && (
        <div className="text-[10px] text-text-dim mb-2 tracking-[1px]">
          STEP {stepNum} OF {totalSteps}
        </div>
      )}
      <h1 className="text-[22px] font-bold text-text mb-2">{title}</h1>
      <p className="text-[13px] text-text-dim leading-[1.6]">{subtitle}</p>
    </div>
  )
}
