import { useEffect, useState } from 'react'
import { Stage } from './canvas/Stage'
import { Toolbar } from './toolbar/Toolbar'
import { useWhiteboardStore } from './state/store'
import { createDebouncedSaver } from './state/persistence'
import { useReportInputFocus } from '../shared/use-report-input-focus'
import type { BoardState } from '../../../shared/whiteboard-types'

export function Whiteboard(): JSX.Element {
  const [version, setVersion] = useState<1 | 2 | null>(null)
  const replaceAll = useWhiteboardStore((s) => s.replaceAll)
  const markClean = useWhiteboardStore((s) => s.markClean)
  const mode = useWhiteboardStore((s) => s.mode)

  useEffect(() => {
    window.api.whiteboard.setMode(mode)
  }, [mode])

  useReportInputFocus()

  // Discover PoE version once.
  useEffect(() => {
    window.api
      .getOverlayState()
      .then((s) => setVersion(s.poeVersion))
      .catch(() => setVersion(1))
  }, [])

  // Load active canvas once we know the version.
  useEffect(() => {
    if (version === null) return
    window.api.whiteboard
      .load(version, { w: window.innerWidth, h: window.innerHeight })
      .then((lib) => {
        replaceAll(lib.active.elements)
        markClean()
      })
      .catch(() => {
        // If load fails, start with an empty canvas.
        markClean()
      })
  }, [version, replaceAll, markClean])

  // Subscribe to dirty -> debounced save + listen for explicit flush IPC.
  useEffect(() => {
    if (version === null) return
    const saver = createDebouncedSaver<BoardState>((state) => {
      window.api.whiteboard.saveActive(version, state)
      useWhiteboardStore.getState().markClean()
    }, 500)

    const unsub = useWhiteboardStore.subscribe((s, prev) => {
      if (s.dirty && s.elements !== prev.elements) {
        saver.schedule({
          schemaVersion: 1,
          elements: s.elements,
          authoredAtGameSize: { w: window.innerWidth, h: window.innerHeight },
        })
      }
    })

    function flushOnUnload(): void {
      if (useWhiteboardStore.getState().dirty) {
        saver.flushNow()
      }
    }
    window.addEventListener('beforeunload', flushOnUnload)

    const unsubPleaseFlush = window.api.whiteboard.onPleaseFlush(() => {
      if (useWhiteboardStore.getState().dirty) saver.flushNow()
    })

    return () => {
      unsub()
      window.removeEventListener('beforeunload', flushOnUnload)
      unsubPleaseFlush()
      saver.cancel()
    }
  }, [version])

  if (version === null) return <></>

  return (
    <div className="w-full h-full relative bg-transparent">
      <Stage />
      <Toolbar version={version} />
    </div>
  )
}
