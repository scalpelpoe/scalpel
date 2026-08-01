import { useEffect, useRef, useState, type RefObject } from 'react'
import type Konva from 'konva'
import type { LiveMirrorElement } from '@shared/whiteboard-types'
import { useWhiteboardStore } from '../state/store'
import { acquireStream, releaseStream, revalidateStream } from './stream'
import { mirrorCss } from './crop'
import { cssEscape } from '../canvas/css-escape'

/** HTML <video> layer that paints every live mirror. Sits behind the Konva
 *  canvas (see index.tsx z-index) so the transparent canvas shows it through,
 *  while the canvas keeps selection/handles on top. Position-synced to each
 *  mirror's Konva hit-rect every frame, so it follows native drag/resize and
 *  window resize without going through the store mid-gesture. */
export function MirrorLayer({ stageRef }: { stageRef: RefObject<Konva.Stage> }): JSX.Element {
  const elements = useWhiteboardStore((s) => s.elements)
  const mirrors = elements.filter((e): e is LiveMirrorElement => e.type === 'liveMirror')
  const [stream, setStream] = useState<MediaStream | null>(null)
  // The whiteboard window is created lazily on first show (see whiteboard.ts),
  // so this component only ever mounts while the board is already visible -
  // hence visible starts true so the first paint acquires the stream without
  // waiting on an IPC round-trip. onShown/onHidden then release the capture
  // while the board is hidden and re-acquire on re-show (a resource
  // optimization, not required for first paint).
  const [visible, setVisible] = useState(true)
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map())
  const containerRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const hasMirrors = mirrors.length > 0

  // Mirror the Toolbar's show/hide subscription pattern: subscribe to the
  // whiteboard window's shown/hidden IPCs and seed the initial state via
  // requestShownState (catches the case where main's onFirstShow fires before
  // this effect runs).
  useEffect(() => {
    const unShown = window.api.whiteboard.onShown(() => {
      setVisible(true)
      // Re-showing the board is the moment a stale stream becomes visible to
      // the user - the visible flag alone can't catch it, since the game-exit
      // hide path never sends a hidden IPC, so visible may already be true
      // and the acquire effect below won't re-run.
      void revalidateStream()
    })
    const unHidden = window.api.whiteboard.onHidden(() => setVisible(false))
    window.api.whiteboard.requestShownState()
    return () => {
      unShown()
      unHidden()
    }
  }, [])

  // Acquire/release the shared capture stream. Gated on both hasMirrors and
  // visible so the desktop capture is released while the whiteboard is hidden.
  useEffect(() => {
    if (!hasMirrors || !visible) return
    const listener = (s: MediaStream | null): void => setStream(s)
    void acquireStream(listener)
    return () => releaseStream(listener)
  }, [hasMirrors, visible])

  // Attach the (shared) stream to each video element.
  useEffect(() => {
    for (const v of videoRefs.current.values()) {
      if (v.srcObject !== stream) v.srcObject = stream
    }
  }, [stream, mirrors.length])

  // Position-sync loop: read each mirror's Konva node rect and lay out the
  // clip container + cropped video over it. Gated on both hasMirrors and
  // visible so the rAF loop is cancelled while the whiteboard is hidden.
  useEffect(() => {
    if (!hasMirrors || !visible) return
    let raf = 0
    const tick = (): void => {
      const stage = stageRef.current
      if (stage) {
        for (const m of useWhiteboardStore.getState().elements) {
          if (m.type !== 'liveMirror') continue
          const node = stage.findOne(`#${cssEscape(m.id)}`)
          const container = containerRefs.current.get(m.id)
          const video = videoRefs.current.get(m.id)
          if (!node || !container || !video) continue
          // skipStroke/skipShadow: the selection stroke (1px) must NOT inflate
          // the measured rect - on a thin mirror it is a large fraction of the
          // width, which would over-scale the video and shift the crop.
          const box = node.getClientRect({ relativeTo: stage, skipStroke: true, skipShadow: true })
          const dpr = window.devicePixelRatio || 1
          const fw = video.videoWidth
          const fh = video.videoHeight
          const frame =
            fw > 0 && fh > 0
              ? { frameW: fw, frameH: fh, clientW: window.innerWidth * dpr, clientH: window.innerHeight * dpr }
              : undefined
          const css = mirrorCss({ x: box.x, y: box.y, w: box.width, h: box.height }, m.source, frame)
          container.style.left = `${css.container.left}px`
          container.style.top = `${css.container.top}px`
          container.style.width = `${css.container.width}px`
          container.style.height = `${css.container.height}px`
          video.style.width = `${css.video.width}px`
          video.style.height = `${css.video.height}px`
          video.style.transform = `translate(${css.video.translateX}px, ${css.video.translateY}px)`
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [hasMirrors, visible, stageRef])

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      {mirrors.map((m) => (
        <div
          key={m.id}
          ref={(el) => {
            if (el) containerRefs.current.set(m.id, el)
            else containerRefs.current.delete(m.id)
          }}
          style={{ position: 'absolute', overflow: 'hidden' }}
        >
          <video
            ref={(el) => {
              if (el) videoRefs.current.set(m.id, el)
              else videoRefs.current.delete(m.id)
            }}
            autoPlay
            muted
            playsInline
            // maxWidth/maxHeight none: defeat Tailwind preflight's
            // `video { max-width: 100% }`, which otherwise caps the scaled-up
            // video to the clip container's width and breaks the crop.
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              transformOrigin: 'top left',
              maxWidth: 'none',
              maxHeight: 'none',
            }}
          />
        </div>
      ))}
    </div>
  )
}
