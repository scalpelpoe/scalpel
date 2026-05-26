import { useEffect } from 'react'
import { Stage } from './canvas/Stage'
import { Toolbar } from './toolbar/Toolbar'
import { useWhiteboardStore } from './state/store'
import { createDebouncedSaver } from './state/persistence'
import { useReportInputFocus } from '../shared/use-report-input-focus'
import type { BoardState } from '../../../shared/whiteboard-types'

export function Whiteboard(): JSX.Element {
  const poeVersion = useWhiteboardStore((s) => s.poeVersion)
  const setPoeVersion = useWhiteboardStore((s) => s.setPoeVersion)
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
      .then((s) => setPoeVersion(s.poeVersion))
      .catch(() => setPoeVersion(1))
  }, [setPoeVersion])

  // Load active canvas once we know the version.
  useEffect(() => {
    if (poeVersion === null) return
    window.api.whiteboard
      .load(poeVersion, { w: window.innerWidth, h: window.innerHeight })
      .then((lib) => {
        replaceAll(lib.active.elements)
        markClean()
      })
      .catch(() => {
        // If load fails, start with an empty canvas.
        markClean()
      })
  }, [poeVersion, replaceAll, markClean])

  // Subscribe to dirty -> debounced save + listen for explicit flush IPC.
  useEffect(() => {
    if (poeVersion === null) return
    const saver = createDebouncedSaver<BoardState>((state) => {
      window.api.whiteboard.saveActive(poeVersion, state)
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
  }, [poeVersion])

  if (poeVersion === null) return <></>

  return (
    <div className="w-full h-full relative bg-transparent">
      <Stage />
      <Toolbar version={poeVersion} />
    </div>
  )
}
