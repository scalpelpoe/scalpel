import { useEffect, useState } from 'react'

import type { LauncherItem, LauncherSliceMode, LauncherStyle } from '@shared/launcher'

import { GroupedMenu } from './GroupedMenu'

import { HubMenu } from './HubMenu'

import { MinimalMenu } from './MinimalMenu'

import { RadialMenu } from './RadialMenu'

import { ReticleMenu } from './ReticleMenu'

import { TwoTierMenu } from './TwoTierMenu'

export function LauncherApp(): JSX.Element {
  const [items, setItems] = useState<LauncherItem[]>([])

  const [sliceMode, setSliceMode] = useState<LauncherSliceMode>('names')

  const [style, setStyle] = useState<LauncherStyle>('classic')

  useEffect(() => {
    void window.api.launcherList().then((payload) => {
      setItems(payload.items)

      setSliceMode(payload.sliceMode)

      setStyle(payload.style)
    })

    return window.api.onLauncherItems((payload) => {
      setItems(payload.items)

      setSliceMode(payload.sliceMode)

      setStyle(payload.style)
    })
  }, [])

  if (style === 'hub') return <HubMenu items={items} sliceMode={sliceMode} />

  if (style === 'reticle') return <ReticleMenu items={items} sliceMode={sliceMode} />

  if (style === 'minimal') return <MinimalMenu items={items} sliceMode={sliceMode} />

  if (style === 'grouped') return <GroupedMenu items={items} sliceMode={sliceMode} />

  if (style === 'twotier') return <TwoTierMenu items={items} sliceMode={sliceMode} />

  return <RadialMenu items={items} sliceMode={sliceMode} />
}
