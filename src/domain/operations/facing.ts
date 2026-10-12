import { z } from "zod"
import type { Tool } from "../tools/tool"
import { toolKindKey } from "../tools/tool"
import type { FacingKeepOut, FixtureKit } from "../fixtures/fixture-kit"
import type { PlateSetup } from "../plate/plate"

export const FacingParamsSchema = z
  .object({
    x: z.number().finite().min(-10000).max(10000),
    y: z.number().finite().min(-10000).max(10000),
    width: z.number().min(0.001).max(2000),
    depth: z.number().min(0.001).max(2000),
    top: z.number().finite().min(-10000).max(10000),
    removal: z.number().min(0.001).max(100),
    stepdown: z.number().min(0.001).max(100),
    stepover: z.number().min(0.001).max(500),
    diameter: z.number().min(0.001).max(500),
    clearance: z.number().min(0.001).max(500),
    rpm: z.number().int().positive().max(100000),
    feed: z.number().positive().max(100000),
    plunge: z.number().positive().max(100000),
  })
  .superRefine((p, ctx) => {
    if (p.stepover > p.diameter / 2)
      ctx.addIssue({
        code: "custom",
        path: ["stepover"],
        message: "Use at most half the cutter diameter for the facing raster.",
      })
    if (
      Math.ceil(p.removal / p.stepdown) *
        (Math.ceil(p.depth / p.stepover) + 1) >
      20000
    )
      ctx.addIssue({
        code: "custom",
        path: ["stepover"],
        message:
          "This raster exceeds 20,000 cutting passes. Increase stepover or stepdown.",
      })
  })
export type FacingParams = z.infer<typeof FacingParamsSchema>

/** Only cutters whose flat cutting surface is explicitly known, never the generic shape fallback. */
export function facingToolIssue(tool: Tool | undefined): string | null {
  if (!tool) return "Assign a library cutter to the facing tool number."
  if (!["flat end mill", "face mill"].includes(toolKindKey(tool.kind)))
    return "Choose a flat end mill or face mill."
  if (!(tool.diameter !== null && tool.diameter > 0))
    return "Enter the cutter diameter in the library."
  if (!(tool.geometry.fluteLength !== null && tool.geometry.fluteLength > 0))
    return "Enter the cutting length in the library."
  if (
    (tool.geometry.cornerRadius ?? 0) !== 0 ||
    (tool.geometry.taperAngle ?? 0) !== 0 ||
    (tool.geometry.tipDiameter !== null &&
      tool.geometry.tipDiameter !== tool.diameter) ||
    (tool.geometry.maxDiameter !== null &&
      tool.geometry.maxDiameter !== tool.diameter)
  )
    return "This wizard supports straight, flat-ended cutters."
  return null
}

/** Built-in protected footprints translated from the bed to the plate's work coordinates. */
export function facingKeepOuts(
  setup: PlateSetup,
  kit: FixtureKit
): readonly FacingKeepOut[] {
  const [x, y, originZ] = setup.workOrigin
  return kit.facingKeepOuts.map((area) => ({
    ...area,
    min: [area.min[0] - x, area.min[1] - y],
    max: [area.max[0] - x, area.max[1] - y],
    top: area.top - originZ,
  }))
}

/** Cutter-centre spans; protected rows enter from outside X, never plunge beside the obstacle. */
export function facingRaster(
  p: FacingParams,
  keepOuts: readonly FacingKeepOut[]
) {
  const left = p.x - p.diameter / 2 - 1
  const right = p.x + p.width + p.diameter / 2 + 1
  const count = Math.ceil(p.depth / p.stepover)
  const expanded = keepOuts.map((area) => {
    // Extra 0.001 mm keeps four-decimal NC rounding outside the clearance boundary.
    const padding = p.diameter / 2 + area.margin + 0.001
    return {
      min: [area.min[0] - padding, area.min[1] - padding],
      max: [area.max[0] + padding, area.max[1] + padding],
    }
  })
  let clipped = false
  const rows = Array.from({ length: count + 1 }, (_, index) => {
    const y = p.y + (p.depth * index) / count
    const blocked = expanded.filter(
      (area) =>
        y >= area.min[1] &&
        y <= area.max[1] &&
        area.max[0] >= left &&
        area.min[0] <= right
    )
    if (!blocked.length) return { y, spans: [[left, right] as const] }
    clipped = true
    // One conservative blocked band also avoids plunging into an island between obstacles.
    const from = Math.min(...blocked.map((area) => area.min[0]))
    const to = Math.max(...blocked.map((area) => area.max[0]))
    const spans: (readonly [number, number])[] = []
    if (from > left) spans.push([left, Math.min(from, right)])
    if (to < right) spans.push([right, Math.max(to, left)])
    return { y, spans }
  })
  const safe = Math.max(
    p.top + p.clearance,
    ...keepOuts.map((area) => area.top + Math.max(p.clearance, area.margin))
  )
  return { left, right, rows, clipped, safe }
}

/** Work-coordinate raster with cutter-radius-aware protected footprints. */
export function facingNc(
  params: FacingParams,
  tool: number,
  keepOuts: readonly FacingKeepOut[]
): string {
  const p = FacingParamsSchema.parse(params)
  const n = (v: number) => v.toFixed(4)
  const raster = facingRaster(p, keepOuts)
  const { left, right, safe } = raster
  const rows = Math.ceil(p.depth / p.stepover)
  const layers = Math.ceil(p.removal / p.stepdown)
  const lines = [
    "(OpenSpindle facing - review setup before Run)",
    "G21 G90 G17 G94",
    `T${tool} M6`,
    `S${p.rpm} M3`,
    `G0 Z${n(safe)}`,
  ]
  for (const area of keepOuts)
    lines.push(
      `(Facing keep-out: ${area.name}; cutter radius plus ${n(area.margin)} mm clearance)`
    )
  for (let layer = 1; layer <= layers; layer++) {
    const cutZ = p.top - Math.min(p.removal, layer * p.stepdown)
    if (raster.clipped) {
      for (const row of raster.rows) {
        for (const [start, end] of row.spans) {
          lines.push(
            `G0 Z${n(safe)}`,
            `G0 X${n(start)} Y${n(row.y)}`,
            `G1 Z${n(cutZ)} F${n(p.plunge)}`,
            `G1 X${n(end)} F${n(p.feed)}`,
            `G0 Z${n(safe)}`
          )
        }
      }
      continue
    }
    lines.push(
      `G0 Z${n(safe)}`,
      `G0 X${n(left)} Y${n(p.y)}`,
      `G1 Z${n(cutZ)} F${n(p.plunge)}`
    )
    for (let row = 0; row <= rows; row++) {
      const y = p.y + (p.depth * row) / rows
      if (row > 0) lines.push(`G1 Y${n(y)} F${n(p.feed)}`)
      lines.push(`G1 X${n(row % 2 === 0 ? right : left)} F${n(p.feed)}`)
    }
    lines.push(`G0 Z${n(safe)}`)
  }
  lines.push("M5", "M30")
  return lines.join("\n")
}
