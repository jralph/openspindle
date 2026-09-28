import type { ProbeGrid, ProbePoint } from "../auto-level/probe-grid"

/** A planned touch-off: where the probe touches the stock top, never a measured height. */
export type ProbeTouch = {
  /** One-based line of its first touch in its NC source. */
  sourceLine: number
  point: ProbePoint
  coordinateMode: ProbeGrid["coordinateMode"]
}
