export {}

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      ELECTRON_RENDERER_URL?: string
      SCALPEL_DEBUG_LOG?: string
      SCALPEL_E2E?: string
      SCALPEL_E2E_USER_DATA?: string
    }
  }
}
