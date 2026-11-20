import { createNativeServiceClient, type PluginActivate, type PoeItem } from '@scalpelpoe/plugin-sdk'
import { NativeItemAnalyzer } from './generated/native_item_analyzer_pb'

const ANALYSIS_STORAGE_KEY = 'latest-analysis'
const POLL_INTERVAL_MS = 250

type AnalysisResult = {
  displayName: string
  totalMods: number
  numericTokens: number
  fingerprint: string
}

type AnalysisState = {
  revision: number
  status: string
  result?: AnalysisResult
}

function itemParams(item: PoeItem) {
  return {
    name: item.name,
    baseType: item.baseType,
    rarity: item.rarity,
    itemLevel: item.itemLevel,
    implicits: item.implicits,
    explicits: item.explicits,
  }
}

const activate: PluginActivate = (ctx) => {
  const native = createNativeServiceClient(ctx.native, NativeItemAnalyzer)
  let analysisInProgress = false
  let revision = Date.now()

  const publish = async (state: Omit<AnalysisState, 'revision'>): Promise<void> => {
    const stored = await ctx.storage.get<AnalysisState>(ANALYSIS_STORAGE_KEY)
    const storedRevision = typeof stored?.revision === 'number' ? stored.revision : -1
    revision = Math.max(Date.now(), revision + 1, storedRevision + 1)
    await ctx.storage.set<AnalysisState>(ANALYSIS_STORAGE_KEY, { revision, ...state })
  }

  const runAnalysis = async (): Promise<void> => {
    try {
      await publish({ status: 'Reading hovered item...' })
      ctx.openOverlay()

      const item = await ctx.copyAndEvaluateItem({ showOverlay: false, dispatch: false })
      if (!item) {
        await publish({ status: 'No item provided.' })
        return
      }

      await publish({ status: 'Waiting for Rust backend...' })
      const analysis = await native.analyzeItem(itemParams(item))
      await publish({
        status: 'Analysis complete.',
        result: {
          displayName: analysis.displayName,
          totalMods: analysis.totalMods,
          numericTokens: analysis.numericTokens,
          fingerprint: analysis.fingerprint,
        },
      })
    } catch (error) {
      ctx.openOverlay()
      try {
        await publish({ status: error instanceof Error ? error.message : String(error) })
      } catch (storageError) {
        ctx.log('Could not publish native item analysis error.', error, storageError)
      }
    } finally {
      analysisInProgress = false
    }
  }

  const analyze = (): void => {
    if (analysisInProgress) {
      ctx.openOverlay()
      return
    }
    analysisInProgress = true
    void runAnalysis()
  }

  ctx.registerHotkey({ label: 'Analyze hovered item' }, analyze)

  ctx.registerTab({
    label: 'Native Item Analyzer',
    icon: '<svg viewBox="0 0 16 16"><path d="M3 2h7l3 3v9H3z" fill="none" stroke="currentColor"/><path d="M6 8h4M6 11h4" stroke="currentColor"/></svg>',
    render(container) {
      container.innerHTML = `
        <section style="padding:16px;display:grid;gap:12px">
          <h2 style="margin:0">Native Item Analyzer</h2>
          <p style="margin:0">Hover an item in Path of Exile, then use the configured hotkey or this button to analyze it through Rust.</p>
          <button type="button" data-analyze-item>Analyze hovered item</button>
        </section>
      `
      const button = container.querySelector<HTMLButtonElement>('[data-analyze-item]')!
      button.addEventListener('click', analyze)
      return () => button.removeEventListener('click', analyze)
    },
  })

  ctx.registerOverlay(
    {
      title: 'Native Item Analyzer',
      defaultSize: { width: 430, height: 390 },
      defaultPosition: { fracX: 0.72, fracY: 0.2 },
    },
    (container) => {
      container.innerHTML = `
        <section style="height:100%;padding:18px;box-sizing:border-box;display:grid;align-content:start;gap:12px;color:inherit">
          <header>
            <div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;opacity:.62">Rust sidecar</div>
            <h2 style="margin:3px 0 0">Hovered Item Analyzer</h2>
          </header>
          <p style="margin:0;opacity:.78">Use the analyzer hotkey while hovering an item in-game. The supervised native backend fingerprints its core data and counts its modifiers.</p>
          <div data-analysis-status style="min-height:20px;opacity:.75">Waiting for analysis...</div>
          <dl data-analysis-result style="display:none;grid-template-columns:auto 1fr;gap:7px 12px;margin:0;padding:12px;border:1px solid color-mix(in srgb,currentColor 22%,transparent);border-radius:6px">
            <dt>Item</dt><dd data-result-name style="margin:0"></dd>
            <dt>Modifiers</dt><dd data-result-mods style="margin:0"></dd>
            <dt>Numbers</dt><dd data-result-numbers style="margin:0"></dd>
            <dt>Fingerprint</dt><dd data-result-fingerprint style="margin:0;font-family:monospace;overflow-wrap:anywhere"></dd>
          </dl>
        </section>
      `
      const status = container.querySelector<HTMLElement>('[data-analysis-status]')!
      const result = container.querySelector<HTMLElement>('[data-analysis-result]')!
      let alive = true
      let readInProgress = false
      let latestRevision = -1

      const refresh = async (): Promise<void> => {
        if (readInProgress) return
        readInProgress = true
        try {
          const state = await ctx.storage.get<AnalysisState>(ANALYSIS_STORAGE_KEY)
          if (!alive || !state || state.revision <= latestRevision) return
          latestRevision = state.revision
          status.textContent = state.status

          if (state.result) {
            container.querySelector<HTMLElement>('[data-result-name]')!.textContent = state.result.displayName
            container.querySelector<HTMLElement>('[data-result-mods]')!.textContent = String(state.result.totalMods)
            container.querySelector<HTMLElement>('[data-result-numbers]')!.textContent = String(
              state.result.numericTokens,
            )
            container.querySelector<HTMLElement>('[data-result-fingerprint]')!.textContent =
              state.result.fingerprint
            result.style.display = 'grid'
          } else {
            result.style.display = 'none'
          }
        } catch (error) {
          if (alive) {
            status.textContent = error instanceof Error ? error.message : String(error)
            result.style.display = 'none'
          }
        } finally {
          readInProgress = false
        }
      }

      void refresh()
      const timer = window.setInterval(() => void refresh(), POLL_INTERVAL_MS)
      return () => {
        alive = false
        window.clearInterval(timer)
      }
    },
  )
}

export default activate
