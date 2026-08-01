export interface MirrorCss {
  container: { left: number; top: number; width: number; height: number }
  video: { width: number; height: number; translateX: number; translateY: number }
}

/** The captured frame vs the game client area, used to correct for window
 *  chrome (title bar / borders) in bordered Windowed mode. All four are in the
 *  same units (capture device px). In borderless mode the frame equals the
 *  client and the correction is a no-op. */
export interface CaptureFrame {
  frameW: number
  frameH: number
  clientW: number
  clientH: number
}

/** Smallest source fraction we divide by, so a zero-size source (mid-drag /
 *  corrupt) doesn't produce Infinity. */
const MIN_SOURCE_FRACTION = 1e-4

interface ClientInFrame {
  ox: number
  oy: number
  cw: number
  ch: number
  fw: number
  fh: number
}

/** Locate the game client rect inside the captured frame. Without frame info,
 *  or when the frame already equals the client (borderless), there is no
 *  chrome: the client fills the frame at the origin (returned as 1x1 so the
 *  ratios cancel). Heuristic for bordered windows: equal left/right/bottom
 *  borders, with the title bar taking the remaining vertical chrome at the top. */
function clientInFrame(frame?: CaptureFrame): ClientInFrame {
  if (!frame || frame.frameW <= 0 || frame.frameH <= 0 || frame.clientW <= 0 || frame.clientH <= 0) {
    return { ox: 0, oy: 0, cw: 1, ch: 1, fw: 1, fh: 1 }
  }
  const fw = frame.frameW
  const fh = frame.frameH
  const cw = Math.min(frame.clientW, fw)
  const ch = Math.min(frame.clientH, fh)
  const border = Math.max(0, (fw - cw) / 2)
  const ox = border
  const oy = Math.max(0, fh - ch - border)
  return { ox, oy, cw, ch, fw, fh }
}

/** Given the mirror's live pixel rect (`destPx`) and the captured region as
 *  normalized game-client fractions (`source`), return the CSS for the clip
 *  container and the full-frame `<video>` inside it. The video is scaled so the
 *  source sub-rectangle of the CLIENT area exactly fills the container, then
 *  translated so that sub-rectangle sits at the container origin. The optional
 *  `frame` corrects for window chrome (the captured frame is bigger than the
 *  client area in bordered Windowed mode); with no chrome the `f.*` terms cancel
 *  and this reduces to `destPx.w / source.w` etc. Resolution-independent. */
export function mirrorCss(
  destPx: { x: number; y: number; w: number; h: number },
  source: { x: number; y: number; w: number; h: number },
  frame?: CaptureFrame,
): MirrorCss {
  const sw = Math.max(MIN_SOURCE_FRACTION, source.w)
  const sh = Math.max(MIN_SOURCE_FRACTION, source.h)
  const f = clientInFrame(frame)
  const videoWidth = (destPx.w * f.fw) / (sw * f.cw)
  const videoHeight = (destPx.h * f.fh) / (sh * f.ch)
  return {
    container: { left: destPx.x, top: destPx.y, width: destPx.w, height: destPx.h },
    video: {
      width: videoWidth,
      height: videoHeight,
      translateX: -(destPx.w / (sw * f.cw)) * (f.ox + source.x * f.cw),
      translateY: -(destPx.h / (sh * f.ch)) * (f.oy + source.y * f.ch),
    },
  }
}
