export {}

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      ELECTRON_RENDERER_URL?: string
      SCALPEL_DEBUG_LOG?: string
    }
  }
}
