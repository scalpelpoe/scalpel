import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import type { RegexPreset } from '../../../../shared/types'
import { loadStorage, useRegexKey } from './mapmods-helpers'
import type { GeneratorHandle, GeneratorProps } from './generator-types'

/** "Custom" regex generator: a free-form textarea. No auto-tags, no qualifier logic,
 *  just a text input whose value is the regex. Persisted to localStorage on change. */
export const CustomGenerator = forwardRef<GeneratorHandle, GeneratorProps>(function CustomGenerator(
  {
    onRegexChange,
    onAutoTagsChange,
    sharedSaveChip,
    sharedLoadChip,
    sharedNewChip,
    sharedSavePanel,
    sharedSavedPresets,
  },
  ref,
) {
  const key = useRegexKey()
  const [value, setValue] = useState<string>(() => loadStorage(key('custom'), '', (s) => s))

  useEffect(() => {
    localStorage.setItem(key('custom'), value)
    onRegexChange(value)
  }, [value, onRegexChange, key])

  // Custom has no auto-tags -- the user types whatever tags they want manually. Emit
  // `null` once so the container knows not to run the tag-sync effect.
  useEffect(() => {
    onAutoTagsChange(null)
  }, [onAutoTagsChange])

  useImperativeHandle(
    ref,
    () => ({
      getPresetPayload: () => ({ customRegex: value }),
      applyPreset: (preset: RegexPreset) => {
        setValue(preset.customRegex ?? '')
      },
      // Custom-generator presets match by the saved regex text.
      matchesPreset: (preset: RegexPreset) => (preset.generator ?? 'maps') === 'custom' && preset.customRegex === value,
      // The container's output bar is the input for Custom; it writes here.
      setRegexText: (text: string) => setValue(text),
    }),
    [value],
  )

  return (
    <>
      {/* Chip header -- Custom has no generator-specific chips, just Save/Load. */}
      <div className="flex flex-col px-3 py-2 border-b border-border bg-bg-card">
        <div className="flex items-center gap-[6px]">
          {sharedNewChip}
          {sharedSaveChip}
          {sharedLoadChip}
        </div>
        {sharedSavePanel}
      </div>
      {sharedSavedPresets}
      <div className="flex-1 bg-bg-card" />
    </>
  )
})
