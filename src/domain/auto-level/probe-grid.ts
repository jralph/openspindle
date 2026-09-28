export type ProbePoint = [number, number]

/** A planned rectangular probe grid: XY samples only, never measured heights. */
export type ProbeGrid = {
  /** One-based line of the probing block in its NC source. */
  sourceLine: number
  start: ProbePoint
  width: number
  depth: number
  columns: number
  rows: number
  pointCount: number
  /** In the order the machine's probe visits them (`GridProbing.samples`). */
  points: ProbePoint[]
  clearanceMm: number | null
  coordinateMode: "relative-to-probe-start" | "machine" | "bed"
}
