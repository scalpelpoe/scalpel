import type { StreamSnapshot } from '@scalpel/stream-contract'
import { buttonClassName } from '@renderer/components/primitives/Button'

const CLASS = `${buttonClassName({ size: 'sm' })} whitespace-nowrap no-underline`

/** The streamer's build guide and item filters, as link buttons. Renders only the ones set. */
export function StreamLinks({ links }: { links: StreamSnapshot['links'] }): JSX.Element | null {
  if (!links || (!links.buildGuide && !links.filters)) return null
  return (
    <>
      {links.buildGuide && (
        <a
          className={CLASS}
          href={links.buildGuide}
          title="Open the streamer's build guide"
          target="_blank"
          rel="noopener noreferrer"
        >
          Build Guide ↗
        </a>
      )}
      {links.filters && (
        <a
          className={CLASS}
          href={links.filters}
          title="Open the streamer's item filters on pathofexile.com"
          target="_blank"
          rel="noopener noreferrer"
        >
          Item Filters ↗
        </a>
      )}
    </>
  )
}
