import type { StatFilter } from '../../trade'
import {
  resolveUltimatumRewardId,
  ULTIMATUM_CHALLENGE_TEXT_TO_ID,
  ULTIMATUM_REWARD_ID_LABEL,
} from '../ultimatum-rewards'

type UltimatumItemInfo = {
  ultimatumChallenge?: string
  ultimatumRewardText?: string
  ultimatumRequired?: string
}

// Inscribed Ultimatum chips. Each chip's id encodes which sub-filter the
// trade query builder should populate; the chip's `option` carries the
// resolved API-internal id (Exterminate, DoubleDivCards, ...) so the
// builder doesn't need to redo the human-text -> id lookup.
const ultChip = (id: string, text: string, option: string, displayValue: string): StatFilter => ({
  id,
  text,
  value: null,
  min: null,
  max: null,
  enabled: true,
  type: 'ultimatum',
  option,
  displayValue,
})

export function buildUltimatumFilters(itemInfo: UltimatumItemInfo | undefined): StatFilter[] {
  const out: StatFilter[] = []

  if (itemInfo?.ultimatumChallenge) {
    const id = ULTIMATUM_CHALLENGE_TEXT_TO_ID[itemInfo.ultimatumChallenge.toLowerCase()]
    if (id) out.push(ultChip('ultimatum.challenge', 'Challenge', id, itemInfo.ultimatumChallenge))
  }
  if (itemInfo?.ultimatumRewardText) {
    const id = resolveUltimatumRewardId(itemInfo.ultimatumRewardText)
    if (id) {
      out.push(ultChip('ultimatum.reward', 'Reward', id, ULTIMATUM_REWARD_ID_LABEL[id] ?? itemInfo.ultimatumRewardText))
      // For "Exchange for <Unique>" rewards, also surface the specific unique
      // name via ultimatum_output so the search narrows to that exact reward.
      // The other reward categories don't have a specific-name dropdown.
      if (id === 'ExchangeUnique') {
        out.push(
          ultChip('ultimatum.output', 'Specific Reward', itemInfo.ultimatumRewardText, itemInfo.ultimatumRewardText),
        )
      }
    }
  }
  if (itemInfo?.ultimatumRequired) {
    // The trade-side ultimatum_input dropdown is keyed by the literal item
    // name (e.g. "No Traces"), so we pass it through verbatim as the option.
    out.push(ultChip('ultimatum.input', 'Sacrifice', itemInfo.ultimatumRequired, itemInfo.ultimatumRequired))
  }

  return out
}
