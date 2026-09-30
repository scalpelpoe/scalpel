/** PoE2 item JSON (trade fetch, character data) embeds localization tokens like
 *  `[Attributes|Attribute]` and `[Spirit]` in mod and property text. The game and
 *  trade site resolve them via their i18n layer; we don't have that, so rewrite
 *  the tokens into their display form: `[a|b]` -> `b`, `[a]` -> `a`. No-op on
 *  PoE1 strings (which never contain these brackets) so it runs unconditionally.
 *  Mirrors EE2's parseAffixStrings helper. */
export function stripTradeTokens(s: string): string {
  return s.replace(/\[([^\]|]+)\|?([^\]]*)\]/g, (_, a: string, b: string) => b || a)
}
