import type { Stock } from "@/domain/stock/stock"
import type { Point3 } from "../primitives"

/** Where a plate's stock sits (its minimum corner) and its NC zero, in bed millimetres. */
export type PlateCoordinates = { stockAnchor: Point3; workOrigin: Point3 }

/** Whether a stock fits in the machine's work area (its X, Y and Z size). */
export const fitsWorkArea = (
  { width, depth, height }: Pick<Stock, "width" | "depth" | "height">,
  workArea: readonly number[]
) => width <= workArea[0] && depth <= workArea[1] && height <= workArea[2]

/**
 * Default placement: the stock centred in the machine's work area (its X and Y size) on its
 * support, the work origin at the stock's top front-left corner. Physical coordinates, without
 * the viewer's drawing offsets.
 */
export function defaultPlateCoordinates(
  stock: Pick<Stock, "width" | "depth" | "height"> | null,
  [width, depth]: readonly number[],
  supportHeight = 0
): PlateCoordinates {
  const stockAnchor: Point3 = stock
    ? [width / 2 - stock.width / 2, depth / 2 - stock.depth / 2, supportHeight]
    : [0, 0, supportHeight]
  return {
    stockAnchor,
    workOrigin: [
      stockAnchor[0],
      stockAnchor[1],
      supportHeight + (stock?.height ?? 0),
    ],
  }
}
