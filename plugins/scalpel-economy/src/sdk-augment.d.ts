export {}

declare module '@scalpelpoe/plugin-sdk' {
  interface PriceEntry {
    name: string
    category: string
    chaosValue: number
    divineValue?: number
    graph?: (number | null)[]
  }
  interface PricesApi {
    getPrices(opts?: { category?: string }): Promise<{ prices: PriceEntry[]; updatedAt: number | null }>
    refresh(): Promise<void>
    onChange(handler: () => void): () => void
  }
  interface ScalpelPluginContext {
    readonly prices: PricesApi
  }
}
