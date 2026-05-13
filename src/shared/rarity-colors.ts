/** Hex tokens for PoE item rarity text colors. Lives in src/shared so both
 *  the renderer and the plugin SDK can import without dragging in renderer-
 *  only state (iconMap, bundled icon sheets). The set is a closed taxonomy
 *  driven by GGG's rarity enum and doesn't change at runtime. */
export const RARITY_COLORS: Record<string, string> = {
  Normal: '#c8c8c8',
  Magic: '#8888ff',
  Rare: '#ffff77',
  Unique: '#af6025',
  Gem: '#1ba29b',
  Divination: '#00BAFE',
}
