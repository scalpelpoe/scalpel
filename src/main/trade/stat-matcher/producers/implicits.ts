import type { StatFilter } from '../../trade'
import { findAdvMod } from '../adv-mods'
import type { MatchContext } from '../context'
import { QUALIFIER_BY_ITEM_CLASS } from '../item-classes'
import { matchModToStat } from '../mod-matcher'
import { accumulatePseudo, PSEUDO_CONTRIBUTIONS } from '../pseudo'
import { dropFragmentDuplicates, GEM_LEVEL_MOD } from './explicits'

export function processImplicits(ctx: MatchContext): StatFilter[] {
  const { implicits, itemInfo, advancedMods, isWeapon, hasLocalMods, isTablet, pseudoAccumulator } = ctx
  const out: StatFilter[] = []

  // Trade stats that share display text across item categories carry a trailing
  // qualifier; pass the item's category so the matcher can pick that variant
  // (see the explicit producer, which does the same).
  const preferQualifier = QUALIFIER_BY_ITEM_CLASS[itemInfo?.itemClass ?? ''] ?? null

  for (const mod of implicits) {
    let cleaned = mod.replace(/\s*\(implicit\)\s*$/i, '').trim()
    // Stygian Vise / abyss belts: clipboard prints "Has 1 Abyssal Socket" but the trade
    // API indexes "Has # Abyssal Sockets". buildSocketFilters already emits the correct
    // chip from the socket string (A). Matching this line here used to fall through to
    // relaxed "Has 1 Socket" (implicit.stat_4077843608), which is incompatible with
    // Stygian Vise and zeroes the search.
    if (/^Has \d+ Abyssal Sockets?$/i.test(cleaned)) continue
    // Try implicit stats first, then fall back to explicit (non-local, then local) and remap the ID
    const matched =
      // Weapons index every local-twinned implicit under the "(Local)" id (a claw's leech
      // implicit is implicit.stat_55876295; its non-local twin has zero listings league-wide).
      matchModToStat(cleaned, isWeapon, 'implicit', false, preferQualifier) ??
      // Armour bases carry local-ONLY implicits (+# to Armour, +# to Evasion Rating, #%
      // increased Energy Shield, #% increased Armour/Evasion/ES, Adds # to # Physical Damage)
      // that have no non-local twin, so the plain lookup above returns nothing and the explicit
      // fallback below invents an implicit.<id> the catalog does not have (0 results). Retry
      // local only for that no-alternative case: armour deliberately does NOT get a blanket
      // local preference, because for twinned stats it is genuinely mixed (a glove's "#% chance
      // to Poison on Hit" implicit is the NON-local id and the local twin has zero listings).
      (hasLocalMods && !isWeapon ? matchModToStat(cleaned, true, 'implicit', false, preferQualifier) : null) ??
      (() => {
        const fallback =
          matchModToStat(cleaned, false, 'explicit', false, preferQualifier) ??
          matchModToStat(cleaned, true, 'explicit', false, preferQualifier)
        if (!fallback) return null
        return { ...fallback, statId: `implicit.${fallback.statId.split('.')[1]}` }
      })()
    if (matched) {
      const advMod = advancedMods ? findAdvMod(advancedMods, cleaned, 'implicit') : undefined
      // Catalyst quality (and other magnitude sources) scale an implicit's roll the
      // same way they scale affixes; GGG annotates the advanced header with
      // "-- N% Increased", parsed onto the AdvancedMod as magnitudeMultiplier. Mirror
      // the explicit path so the chip shows the real scaled value and the trade
      // search min matches (#477).
      if (advMod?.magnitudeMultiplier && matched.value != null) {
        const oldVal = matched.value
        matched.value = Math.trunc(oldVal * advMod.magnitudeMultiplier)
        cleaned = cleaned.replace(String(Math.abs(oldVal)), String(Math.abs(matched.value)))
      }
      // Skip "X per Y" mods -- they're conditional and shouldn't inflate pseudo totals
      const isPerMod = /\bper\b/i.test(cleaned)
      const pseudoList = PSEUDO_CONTRIBUTIONS[matched.statId]
      if (pseudoList && matched.value != null && !isPerMod) {
        accumulatePseudo(pseudoAccumulator, pseudoList, matched.value, isWeapon)
      }
      // Eldritch implicits (Searing Exarch / Eater of Worlds) name their altar in the
      // advanced header, so the source badge reads it straight off the parsed mod - no
      // dataset lookup, unlike the explicit affixes.
      const modSource = advMod?.eldritchSource
      // Gem-level implicits (e.g. corrupted "+1 to Level of all Skill Gems" on
      // amulets) are discrete brackets -- pin max to the exact rolled value so
      // the search doesn't merge with pricier +2 listings.
      const isGemLevelMod = GEM_LEVEL_MOD.test(cleaned)
      out.push({
        id: matched.statId,
        text: cleaned,
        value: matched.value,
        min: matched.option ? null : matched.value,
        max: isGemLevelMod && matched.value != null ? matched.value : null,
        enabled:
          !!itemInfo?.corrupted ||
          !!itemInfo?.synthesised ||
          (!!matched.option && itemInfo?.itemClass !== 'Expedition Logbooks') ||
          itemInfo?.itemClass === 'Maps' ||
          // A tablet's sole implicit ("Adds X to a Map / # uses remaining") is its
          // defining property and what buyers filter on, so default it on with the
          // parsed uses count as the min.
          isTablet ||
          // A vestigial item's implicit replaces the base implicit and is the
          // item's defining mod, so it is what buyers filter on.
          !!itemInfo?.vestigial ||
          // A 3.30 Viscera has nothing but its implicit, and the roll is the only
          // thing separating a Lesser part from a Greater one: trade files every
          // tier under the same bare type.
          itemInfo?.itemClass === 'Viscera',
        type: 'implicit',
        option: matched.option,
        aggregated: matched.aggregated,
        modSource,
      })
    }
  }

  return dropFragmentDuplicates(out)
}
