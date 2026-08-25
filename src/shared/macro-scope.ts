export type MacroScope = 'poe1' | 'poe2' | 'both'

const POE1_ONLY_CHAT_COMMANDS: ReadonlySet<string> = new Set(['/menagerie', '/delve', '/kingsmarch', '/monastery'])

const POE1_ONLY_APP_MACROS: ReadonlySet<string> = new Set(['openDust', 'openDivCards', 'openTimeless'])

export function chatCommandScope(command: string): MacroScope {
  const normalized = command.trim().toLowerCase()
  return POE1_ONLY_CHAT_COMMANDS.has(normalized) ? 'poe1' : 'both'
}

export function appMacroScope(actionId: string): MacroScope {
  return POE1_ONLY_APP_MACROS.has(actionId) ? 'poe1' : 'both'
}

/** Effective scope of a chat command entry: explicit override (set when the user binds
 *  in one game on a hotkey already held by an other-game-only entry) or fall back to
 *  the scope inferred from the command text. */
export function chatCommandEffectiveScope(entry: { command: string; scope?: MacroScope }): MacroScope {
  return entry.scope ?? chatCommandScope(entry.command)
}

export function appMacroEffectiveScope(entry: { action: string; scope?: MacroScope }): MacroScope {
  return entry.scope ?? appMacroScope(entry.action)
}

export function scopeAppliesTo(scope: MacroScope, game: 1 | 2): boolean {
  if (scope === 'both') return true
  return (scope === 'poe1' && game === 1) || (scope === 'poe2' && game === 2)
}
