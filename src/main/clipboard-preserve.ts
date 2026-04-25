import { clipboard } from 'electron'

/**
 * Snapshot the current clipboard (text + HTML) and return a function that
 * restores it. Used around any flow that temporarily writes to the clipboard
 * (price-check item capture, regex paste, chat paste) so the user's copied
 * content survives the round trip.
 */
export function snapshotClipboard(): () => void {
  const prevText = clipboard.readText()
  const prevHtml = clipboard.readHTML()
  return () => {
    if (prevHtml) clipboard.write({ text: prevText, html: prevHtml })
    else if (prevText) clipboard.writeText(prevText)
    else clipboard.clear()
  }
}
