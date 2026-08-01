import { useEffect, useRef } from 'react'
import type Konva from 'konva'
import { Stage } from './canvas/Stage'
import { Toolbar } from './toolbar/Toolbar'
import { useWhiteboardStore } from './state/store'
import { createDebouncedSaver } from './state/persistence'
import { useReportInputFocus } from '../shared/use-report-input-focus'
import type { BoardState } from '@shared/whiteboard-types'
import { MirrorLayer } from './live-mirror/MirrorLayer'

export function Whiteboard(): JSX.Element {
  const stageRef = useRef<Konva.Stage>(null)
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
      .then((s) => {
        setPoeVersion(s.poeVersion)
      })
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
      {/* Explicit positive layering, bottom to top: the live-mirror video (z-0)
          shows through the transparent Konva canvas (z-10), and the toolbar
          (z-20, set on its own root) stays above the canvas so it keeps
          receiving clicks. Positive z-indices are required - a negative z-index
          on the video layer does not composite over the game in this
          transparent overlay window. */}
      <div className="absolute inset-0" style={{ zIndex: 0 }}>
        <MirrorLayer stageRef={stageRef} />
      </div>
      <div className="absolute inset-0" style={{ zIndex: 10 }}>
        <Stage stageRef={stageRef} />
      </div>
      <Toolbar version={poeVersion} />
    </div>
  )
}
