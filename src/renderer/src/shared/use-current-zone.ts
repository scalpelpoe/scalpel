import { useEffect, useState } from 'react'
import type { Zone } from '@shared/types'
import { isTownOrHideout } from '@shared/is-town-or-hideout'
import { usePoeVersion } from './poe-version-context'

/** React subscription to the main-process zone state. Returns the latest
 *  raw zone event, including towns and hideouts. Null only when no zone
 *  event has fired yet (game just launched, log not yet tailed). */
export function useCurrentZone(): Zone | null {
  const [zone, setZone] = useState<Zone | null>(null)
  useEffect(() => {
    return window.api.onZoneChanged(setZone)
  }, [])
  return zone
}

/** Like useCurrentZone but ignores town/hideout transitions: once the
 *  player has been in a real zone, the value sticks to that zone across
 *  any subsequent town/hideout events, only updating when a different
 *  real zone is entered. Use for displays that should track "the zone
 *  the player is working on" rather than "the zone they're standing
 *  in right now". */
export function useStickyZone(): Zone | null {
  const zone = useCurrentZone()
  const version = usePoeVersion()
  const [sticky, setSticky] = useState<Zone | null>(null)
  useEffect(() => {
    if (!zone) return
    if (isTownOrHideout(zone.areaCode, version)) return
    setSticky(zone)
  }, [zone, version])
  return sticky
}
