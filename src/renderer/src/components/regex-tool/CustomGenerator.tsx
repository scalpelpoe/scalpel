import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import type { RegexPreset } from '../../../../shared/types'
import { loadStorage } from './mapmods-helpers'
import type { GeneratorHandle, GeneratorProps } from './generator-types'

/** "Custom" regex generator: a free-form textarea. No auto-tags, no qualifier logic,
 *  just a text input whose value is the regex. Persisted to localStorage on change. */
export const CustomGenerator = forwardRef<GeneratorHandle, GeneratorProps>(function CustomGenerator(
  { onRegexChange, onAutoTagsChange, sharedSaveChip, sharedLoadChip, sharedSavePanel, sharedSavedPresets },
  ref,
) {
  const [value, setValue] = useState<string>(() => loadStorage('scalpel:regex:custom', '', (s) => s))

  useEffect(() => {
    localStorage.setItem('scalpel:regex:custom', value)
    onRegexChange(value)
  }, [value, onRegexChange])

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
    }),
    [value],
  )

  return (
    <>
      {/* Chip header -- Custom has no generator-specific chips, just Save/Load. */}
      <div className="flex flex-col px-3 py-2 border-b border-border bg-bg-card">
        <div className="flex items-center gap-[6px]">
          {sharedSaveChip}
          {sharedLoadChip}
        </div>
        {sharedSavePanel}
      </div>
      {sharedSavedPresets}
      <div className="flex-1 flex flex-col bg-bg-card px-3 py-3">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Paste or type your custom regex"
          className="flex-1 w-full text-[12px] font-mono bg-black/30 rounded px-3 py-2 resize-none text-text outline-none"
          style={{ minHeight: 120, border: '1px solid rgba(0,0,0,0.3)' }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = 'rgba(0,0,0,0.5)'
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = 'rgba(0,0,0,0.3)'
          }}
        />
      </div>
    </>
  )
})
