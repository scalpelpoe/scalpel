import './wasm/wasm_exec.js'
import { initializeCrystalline } from './crystalline'
import { loadSkillTree } from './tree/skill-tree'
import wasmUrl from './wasm/calculator.wasm?url'

let bootPromise: Promise<void> | null = null

/** Load Vilsol calculator.wasm once per renderer process, then expose crystalline APIs + skill tree. */
export function bootTimelessJewels(): Promise<void> {
  if (!bootPromise) {
    bootPromise = (async () => {
      const go = new Go()
      const buffer = await (await fetch(wasmUrl)).arrayBuffer()
      const result = await WebAssembly.instantiate(buffer, go.importObject)
      // Keep the Go runtime alive; crystalline callbacks need it.
      void go.run(result.instance)
      initializeCrystalline()
      loadSkillTree()
    })().catch((err) => {
      bootPromise = null
      throw err
    })
  }
  return bootPromise
}
