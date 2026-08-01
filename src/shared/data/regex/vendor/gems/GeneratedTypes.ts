// Data sourced from poe-vendor-string (https://github.com/veiset/poe-vendor-string)
// Used with permission. All credit to veiset and contributors.
export interface Token<T> {
  id: number,
  regex: string,
  rawText: string,
  generalizedText: string,
  options: T,
}
export interface TokenOptimization {
  ids: number[],
  regex: string,
  weight: number,
  count: number,
}
export interface Regex<T> {
  tokens: Token<T>[],
  optimizationTable: {[ids: string]: TokenOptimization },
}
export interface GemsTokenOption {
  c: string,
  support: boolean,
}