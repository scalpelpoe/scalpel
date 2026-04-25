import type { RegexPreset, RegexPresetTag } from '../../../../shared/types'

/** Imperative handle every regex generator exposes via forwardRef. The container uses
 *  this to dispatch save/load operations without needing to own the generator's state.
 *  This is a deliberate escape-hatch from pure-props architecture: lifting every piece
 *  of generator state would swamp the container, so we let each generator own its
 *  state and let the container call these methods when the user triggers preset ops. */
export interface GeneratorHandle {
  /** The generator-specific payload to embed in a saved RegexPreset. Container merges
   *  this with shared fields (id, generator key, tags, regex). */
  getPresetPayload(): Partial<RegexPreset>
  /** Hydrate state from a previously-saved preset. Called when the user loads a preset. */
  applyPreset(preset: RegexPreset): void
  /** Identify whether a saved preset matches the generator's current state. Used by the
   *  container to decide whether a save is an update vs. a new preset. */
  matchesPreset(preset: RegexPreset): boolean
}

/** Shared props every regex generator accepts. The container passes `shared*` render
 *  props so each generator can inline the shared chrome (Save/Load chip, save panel,
 *  SavedPresets strip) in the layout position that makes sense for its UI -- e.g. maps
 *  interleaves Save/Load with its own Search/Trade chips in one row. */
export interface GeneratorProps {
  /** Called whenever the generator's produced regex string changes. Container mirrors
   *  this into the output bar + copy-clipboard state. */
  onRegexChange: (regex: string) => void
  /** Called whenever the generator's auto-derived tag set changes (e.g. Maps' qualifier
   *  + avoid + want tags). Container uses this to sync `presetTags`. Emit `null` to
   *  indicate the generator has no auto-tag concept (e.g. plain custom-text inputs). */
  onAutoTagsChange: (tags: RegexPresetTag[] | null) => void
  /** Save chip JSX the container wants the generator to inline in its chip row. */
  sharedSaveChip: React.ReactNode
  /** Load chip JSX the container wants the generator to inline in its chip row. */
  sharedLoadChip: React.ReactNode
  /** Save tag-editor panel (collapsible), rendered wherever the generator places it. */
  sharedSavePanel: React.ReactNode
  /** SavedPresets strip (collapsible), rendered wherever the generator places it. */
  sharedSavedPresets: React.ReactNode
}

/** Registry entry describing a generator. Add a new one here and create a matching
 *  component to surface a new tab (e.g. a vendor-regex page). */
export interface GeneratorConfig {
  /** Short tab label. */
  label: string
  /** Internal stable key -- stored in localStorage, attached to saved presets. */
  key: string
}
