import type { Probe } from "../../probing/probe"
import { WIRED_PROBE_SECTIONS } from "./wired-probe/blocks"
import { G32_GRID } from "./wired-probe/grid"
import { LASER_TRACE } from "./wired-probe/laser-trace"
import { TOUCH_OFF } from "./wired-probe/touch-off"

/**
 * Makera's wired Probe 2.0 on the Z1: G32 grids that the firmware compensates with, the
 * firmware's own Z touch-off, and the probe's laser to trace an outline.
 */
export class MakeraWiredProbe implements Probe {
  readonly autoLevel = G32_GRID
  readonly autoZHeight = TOUCH_OFF
  readonly autoScan = LASER_TRACE
  readonly sections = WIRED_PROBE_SECTIONS
}
