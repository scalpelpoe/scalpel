import { useEffect, useMemo } from 'react'
import type { PoeItem } from '@shared/types'
import type { ExternalLinkButtonProps } from '../shared/ExternalLinkButton'
import type { RegisteredPriceCheckAction } from './types'

export type PriceCheckButton = ExternalLinkButtonProps & { pluginId: string }

export function usePriceCheckActions(
  actions: RegisteredPriceCheckAction[],
  item: PoeItem | undefined,
  poeVersion: 1 | 2,
  onError: (pluginId: string, error: Error) => void,
): PriceCheckButton[] {
  const { buttons, errors } = useMemo(() => {
    const buttons: PriceCheckButton[] = []
    const errors: Array<{ pluginId: string; error: Error }> = []
    if (item) {
      for (const { pluginId, label, title, isVisible, run } of actions) {
        try {
          if (isVisible && !isVisible(item, poeVersion)) continue
        } catch (error) {
          errors.push({ pluginId, error: error instanceof Error ? error : new Error(String(error)) })
          continue
        }
        buttons.push({
          pluginId,
          label,
          title,
          onClick: async () => {
            try {
              await run(item, poeVersion)
            } catch (error) {
              onError(pluginId, error instanceof Error ? error : new Error(String(error)))
            }
          },
        })
      }
    }
    return { buttons, errors }
  }, [actions, item, poeVersion, onError])

  useEffect(() => {
    for (const { pluginId, error } of errors) onError(pluginId, error)
  }, [errors, onError])
  return buttons
}
