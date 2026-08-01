/** PoE1 Chart support (Allflame league).
 *
 *  The trade API gives every chart zone its own entry in the `chart` group of
 *  /api/trade/data/items, expressed as a type + discriminator pair:
 *
 *    { "type": "SeaPillars", "text": "Coral Forest Chart (Sea Pillars)",
 *      "disc": "chart_coral_forest" }
 *
 *  The parenthesised text is display-only; a search sends
 *  `type: { option: "SeaPillars", discriminator: "chart_coral_forest" }`.
 *  Transcribed 2026-07-27. Keys are the zone name exactly as the clipboard
 *  prints it, which is the same string the trade text shows in parentheses.
 */
export const CHART_ZONES: Record<string, { option: string; discriminator: string }> = {
  'Abyssal Plain': { option: 'AbyssalPlain', discriminator: 'chart_sandy_seabed' },
  Anchorfield: { option: 'Anchorfield', discriminator: 'chart_sandy_seabed' },
  "Brine King's Domain": { option: 'BrineKingsDomain', discriminator: 'chart_coral_reef' },
  'Clam-infested Shelf': { option: 'ClamInfestedShelf', discriminator: 'chart_coral_reef' },
  'Diving Shoals': { option: 'DivingShoals', discriminator: 'chart_coral_reef' },
  'Hazardous Depths': { option: 'HazardousDepths', discriminator: 'chart_sandy_seabed' },
  'Infested Bathyspheres': { option: 'InfestedBathyspheres', discriminator: 'chart_sandy_seabed' },
  "Kishara's Rest": { option: 'KisharasRest', discriminator: 'chart_sandy_seabed' },
  'Lost Ruins': { option: 'LostRuins', discriminator: 'chart_coral_forest' },
  'Pelagic Abyss': { option: 'PelagicAbyss', discriminator: 'chart_coral_forest' },
  'Sea Pillars': { option: 'SeaPillars', discriminator: 'chart_coral_forest' },
  'Seafloor Ridges': { option: 'SeafloorRidges', discriminator: 'chart_coral_reef' },
  'Sunken Totems': { option: 'SunkenTotems', discriminator: 'chart_coral_reef' },
  'Undersea Groves': { option: 'UnderseaGroves', discriminator: 'chart_coral_forest' },
}

/** Chart shape name (clipboard "Chart Shape: Straight") -> the option id the
 *  trade API's map_filters.chart_shape expects. From /api/trade/data/filters. */
export const CHART_SHAPE_OPTIONS: Record<string, string> = {
  End: '1',
  Corner: '2',
  Straight: '3',
  Junction: '4',
  Crossing: '5',
}
