import type { Stock } from "@/domain/stock/stock"

/**
 * The markers a CAM writes in the comments of the programs it makes: where its toolpaths start
 * and what they are called, and the stock a program is for. A machine's kit reads those of the
 * CAM made for its machine.
 */
export interface CamMarkers {
  /**
   * The toolpaths the lines start, by the index of the line that starts each, with its name.
   * Null when the lines mark no toolpath start, and headings in comments name toolpaths instead.
   */
  toolpaths: (lines: readonly string[]) => ReadonlyMap<number, string> | null
  /**
   * The stock the lines describe, on `fallback`'s other properties; null when they describe none,
   * or none that makes a valid stock.
   */
  stock: (
    lines: readonly string[],
    fileName: string,
    fallback: Stock
  ) => Stock | null
}

/**
 * A toolpath's name from a CAM as sections show it: trimmed, at most 160 characters and without
 * control characters; null otherwise.
 */
export function camLabel(value: string | undefined): string | null {
  const text = value?.trim()
  return text &&
    text.length <= 160 &&
    ![...text].some(
      (character) =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127
    )
    ? text
    : null
}
