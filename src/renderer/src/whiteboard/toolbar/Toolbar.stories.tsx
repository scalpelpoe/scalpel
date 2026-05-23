import type { Meta, StoryObj } from '@storybook/react-vite'
import { useEffect } from 'react'
import { Toolbar } from './Toolbar'
import { useWhiteboardStore, type Tool } from '../state/store'

/** The whiteboard toolbar floats over the game; in stories we render it on a
 *  PoE-ish dark backdrop and stub the IPC surface the toolbar reaches for. */
// biome-ignore lint/suspicious/noExplicitAny: storybook IPC stub
const win = window as any
win.api = win.api ?? {}
win.api.whiteboard = win.api.whiteboard ?? {
  requestClose: (): void => undefined,
  setMode: (): void => undefined,
  reportToolbarRects: (): void => undefined,
  clearToolbarRect: (): void => undefined,
  load: async (): Promise<unknown> => ({
    active: { schemaVersion: 1, elements: [], authoredAtGameSize: { w: 1920, h: 1080 } },
    snapshots: [
      {
        id: 'demo1',
        name: 'Boss strats - uber maven',
        createdAt: Date.now() - 1000 * 60 * 30,
        state: { schemaVersion: 1, elements: [], authoredAtGameSize: { w: 1920, h: 1080 } },
      },
      {
        id: 'demo2',
        name: 'Atlas tree highlights',
        createdAt: Date.now() - 1000 * 60 * 60 * 4,
        state: { schemaVersion: 1, elements: [], authoredAtGameSize: { w: 1920, h: 1080 } },
      },
    ],
  }),
  saveActive: (): void => undefined,
  saveAsSnapshot: async (): Promise<{ id: string }> => ({ id: 'new' }),
  deleteSnapshot: async (): Promise<unknown[]> => [],
  renameSnapshot: async (): Promise<unknown[]> => [],
  onPleaseFlush: (): (() => void) => () => undefined,
  // Toolbar starts in the wb-toolbar-hidden state and waits for the shown
  // IPC to reveal itself (eliminates a flash on whiteboard re-open). Stories
  // have no main process driving the IPC, so fire it immediately on subscribe
  // so the toolbar is visible.
  onShown: (cb: () => void): (() => void) => {
    cb()
    return () => undefined
  },
  onHidden: (): (() => void) => () => undefined,
  requestShownState: (): void => undefined,
}

interface ToolbarStoryArgs {
  tool: Tool
  /** Pre-seed canvas with a fake element so undo/clear/save-current is enabled. */
  hasContent: boolean
}

function ToolbarHarness({ tool, hasContent }: ToolbarStoryArgs): JSX.Element {
  const setTool = useWhiteboardStore((s) => s.setTool)
  const replaceAll = useWhiteboardStore((s) => s.replaceAll)
  useEffect(() => {
    setTool(tool)
    replaceAll(
      hasContent
        ? [
            {
              id: 'demo',
              z: 0,
              rotation: 0,
              type: 'text',
              text: 'demo',
              bbox: { x: 0.1, y: 0.1, w: 0.1, h: 0.1 },
              color: '#fff',
              fontSize: 0.025,
              fontWeight: 700,
            },
          ]
        : [],
    )
  }, [tool, hasContent, setTool, replaceAll])

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#0d0f15',
      }}
    >
      <Toolbar version={1} />
    </div>
  )
}

const meta: Meta<typeof ToolbarHarness> = {
  title: 'Whiteboard / Toolbar',
  component: ToolbarHarness,
  argTypes: {
    tool: {
      control: 'select',
      options: ['select', 'pen', 'highlighter', 'eraser', 'shape', 'text'],
    },
    hasContent: { control: 'boolean' },
  },
  parameters: {
    layout: 'fullscreen',
  },
}
export default meta

type Story = StoryObj<typeof ToolbarHarness>

export const Default: Story = { args: { tool: 'select', hasContent: false } }
export const InkMarker: Story = { args: { tool: 'pen', hasContent: true } }
export const InkHighlighter: Story = { args: { tool: 'highlighter', hasContent: true } }
export const InkEraser: Story = { args: { tool: 'eraser', hasContent: true } }
export const Shape: Story = { args: { tool: 'shape', hasContent: true } }
export const Text: Story = { args: { tool: 'text', hasContent: true } }
