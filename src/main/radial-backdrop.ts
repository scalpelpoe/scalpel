import { nativeImage } from 'electron'
import type { RadialBackdropResult } from '@shared/contracts/radial'
import { captureGameWindowResult } from './screen-capture/capture'
import { cropFrame } from './screen-capture/pixels'

/** Longest side of the encoded backdrop.
 *
 *  This used to be 192, on the reasoning that the (then 18px) blur throws away
 *  anything finer. The reasoning was backwards: the renderer stretches this image
 *  back up to the crop's full ~460 CSS px, so the blur is measured in DISPLAY px,
 *  and at 192 that worked out to a Gaussian spanning a fifth of the source image.
 *  It was not softening the scene, it was averaging it - the crop arrived as one
 *  flat colour before the grade even started, which is also why the shipped blur
 *  is now 2px rather than 18.
 *
 *  So the target is the disc's own physical pixels. The visible disc is at most
 *  2 * (RING_RADIUS * RADIAL_SCALE_MAX + ICON_HALO + DISC_PAD) = 237 CSS px of
 *  the 460 CSS px crop; asking for that region at the display's physical
 *  resolution is the same as asking for the whole crop at it, which is exactly
 *  what `cropped` already is (frame.scale carries the display scale factor).
 *  This constant therefore only has to be a ceiling, and since the crop shrank
 *  with the ring it is now a roomy one: 640 keeps everything up to a 1.39x
 *  display untouched and still gives a 1.5x one ~0.93 of native. The encoded
 *  frame is correspondingly cheaper than the measurement below, which was taken
 *  at the full 640.
 *
 *  Paired with JPEG below, because 640^2 of PNG'd game art is most of a megabyte
 *  and this rides the hotkey path. */
const ENCODE_MAX_PX = 640

/** JPEG quality for the encode. High enough that Raw view in the developer
 *  tuning panel shows a clean crop - the whole point of that view is to judge
 *  the CAPTURE, so it must not end up judging the codec - and low enough to keep
 *  the data URL modest. Measured on a deliberately grain-heavy 640px stand-in
 *  (worse than real game art): ~118KB here, against ~1.1MB for the same frame as
 *  PNG, which is why this path cannot stay on nativeImage's default encoder.
 *  The shipped look blurs the result at 18px, where the codec is invisible. */
const ENCODE_QUALITY = 82

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

/** One-shot grab of the game pixels behind the radial menu: capture a frame,
 *  cut a square of `half` CSS px either side of the open point, and encode it at
 *  up to ENCODE_MAX_PX. Returns where the crop actually landed in game CSS px,
 *  which is how
 *  the renderer puts it back down 1:1 without replicating any of this math -
 *  the crop clamps at the frame edges, so what comes back is often neither
 *  centred on `center` nor `2 * half` wide.
 *
 *  Never throws: on any failure it reports which gate closed and the caller
 *  keeps its plain tinted disc. The disc alone is a perfectly good menu, and
 *  this runs on the hotkey path.
 *
 *  skipFocusGate is the whole reason the backdrop works at all. This is called
 *  microseconds after the radial overlay's own show(), and
 *  windowTracker.targetHasFocus flickers around exactly that - the same trap
 *  getGameCursorPosition documents and sidesteps. Re-asking the flag here made
 *  the grab return null more often than not, with nothing in the payload to say
 *  why. The privacy invariant holds without it: this can only be reached from
 *  inside a radial open, which only happens on a hotkey the app-macro dispatch
 *  already gated on the game being the active context. */
export async function captureRadialBackdrop(
  center: { x: number; y: number },
  half: number,
): Promise<RadialBackdropResult> {
  try {
    const grab = await captureGameWindowResult({ skipFocusGate: true })
    const frame = grab.frame
    if (!frame) return { failure: grab.failure }

    // CSS px -> captured-frame px. The frame is often downscaled from physical
    // (see MAX_CAPTURE_HEIGHT), which is exactly what frame.scale absorbs.
    const fx = Math.round((center.x - half) * frame.scale)
    const fy = Math.round((center.y - half) * frame.scale)
    const side = Math.round(2 * half * frame.scale)
    const x0 = clamp(fx, 0, frame.width)
    const y0 = clamp(fy, 0, frame.height)
    const w = clamp(fx + side, x0, frame.width) - x0
    const h = clamp(fy + side, y0, frame.height) - y0
    if (w <= 0 || h <= 0) return { failure: 'crop' }

    const cropped = cropFrame(frame.data, frame.width, { x: x0, y: y0, width: w, height: h })
    if (cropped.width <= 0 || cropped.height <= 0) return { failure: 'crop' }

    // createFromBitmap takes BGRA, which is what the capture already is - no
    // channel swap needed on this path (unlike the plugin capture API, which
    // hands RGBA to JS canvases).
    let img = nativeImage.createFromBitmap(cropped.data, { width: cropped.width, height: cropped.height })
    const longest = Math.max(cropped.width, cropped.height)
    if (longest > ENCODE_MAX_PX) {
      const k = ENCODE_MAX_PX / longest
      img = img.resize({
        width: Math.max(1, Math.round(cropped.width * k)),
        height: Math.max(1, Math.round(cropped.height * k)),
        quality: 'good',
      })
    }
    // JPEG rather than nativeImage.toDataURL()'s PNG - see ENCODE_QUALITY. The
    // capture is opaque, so the channel JPEG drops was never carrying anything.
    const jpeg = img.toJPEG(ENCODE_QUALITY)
    if (!jpeg || jpeg.length < 32) return { failure: 'empty-frame' }
    const dataUrl = `data:image/jpeg;base64,${jpeg.toString('base64')}`

    return {
      dataUrl,
      origin: { x: x0 / frame.scale, y: y0 / frame.scale },
      width: w / frame.scale,
      height: h / frame.scale,
    }
  } catch (err) {
    if (process.env.SCALPEL_DEBUG_LOG) console.error('[radial-backdrop] capture failed', err)
    return { failure: 'error' }
  }
}
