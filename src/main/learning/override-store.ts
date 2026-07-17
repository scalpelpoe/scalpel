// src/main/learning/override-store.ts

export interface OverridePersistence {
  load(): Record<string, Record<string, boolean>>
  save(data: Record<string, Record<string, boolean>>): void
}

type Overrides = Record<string, Record<string, boolean>>

/** Manual learned-preference pins (issue #479), keyed by pin scope
 *  (rarity|itemClass, or u|name for uniques) then chip id. A pin is a hard
 *  override: it wins over statistical decisions and applies in every adaptive
 *  mode including off, so "off" still honors explicit user intent. */
export class OverrideStore {
  private overrides: Overrides

  constructor(private readonly persistence: OverridePersistence) {
    this.overrides = persistence.load() ?? {}
  }

  set(scopeKey: string, chipId: string, enabled: boolean): void {
    ;(this.overrides[scopeKey] ??= {})[chipId] = enabled
    this.persistence.save(this.overrides)
  }

  unset(scopeKey: string, chipId: string): void {
    const scope = this.overrides[scopeKey]
    if (!scope || !(chipId in scope)) return
    delete scope[chipId]
    if (Object.keys(scope).length === 0) delete this.overrides[scopeKey]
    this.persistence.save(this.overrides)
  }

  forScope(scopeKey: string): Record<string, boolean> {
    return { ...this.overrides[scopeKey] }
  }
}
