import { machiningPrograms } from "../operations/kinds"
import type { Plate } from "../plate/plate"
import {
  stockWorkArea,
  toolpathBoundsOf,
  workAreaOnStock,
} from "./cutting-bounds"
import type { ToolpathBoundsResult, WorkAreaResult } from "./cutting-bounds"

export {
  cuts,
  cuttingBounds,
  roundOutward,
  workAreaOnStock,
} from "./cutting-bounds"
export type {
  BedXY,
  ToolpathBounds,
  ToolpathBoundsResult,
  WorkArea,
  WorkAreaResult,
} from "./cutting-bounds"

/**
 * Where a plate's machining cuts, in work coordinates: the cutting bounds of every operation
 * outside the setup phase (probing and scans are left out), each measured from its own NC, so a
 * setup operation can use them while its plate compiles. The one definition of a plate's
 * toolpath extent: the viewer outlines it and snaps to it, and the probing operations fit to it.
 */
export function plateToolpathBounds(plate: Plate): ToolpathBoundsResult {
  return toolpathBoundsOf(machiningPrograms(plate))
}

/**
 * The plate's work area for probing: its toolpath bounds on the stock, or the whole stock when
 * the plate has no machining operations to fit to.
 */
export function plateWorkArea(plate: Plate): WorkAreaResult {
  const programs = machiningPrograms(plate)
  const toolpath = toolpathBoundsOf(programs)
  if (toolpath.ok) return workAreaOnStock(toolpath.bounds, plate.setup)
  if (programs.length) return toolpath
  return stockWorkArea(plate.setup)
}
