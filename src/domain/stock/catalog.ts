import stocks from "@/data/stocks.json"
import type { Stock } from "./stock"

export function createDefaultStockLibrary(): Stock[] {
  return structuredClone(stocks)
}
