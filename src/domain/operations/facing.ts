import { z } from "zod"
import type { Tool } from "../tools/tool"
import { toolKindKey } from "../tools/tool"

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

/** Work-coordinate raster; every depth pass starts outside X and retracts before repositioning. */
export function facingNc(params: FacingParams, tool: number): string {
  const p = FacingParamsSchema.parse(params)
  const n = (v: number) => v.toFixed(4)
  const left = p.x - p.diameter / 2 - 1
  const right = p.x + p.width + p.diameter / 2 + 1
  const rows = Math.ceil(p.depth / p.stepover)
  const layers = Math.ceil(p.removal / p.stepdown)
  const safe = p.top + p.clearance
  const lines = [
    "(OpenSpindle facing - review setup before Run)",
    "G21 G90 G17 G94",
    `T${tool} M6`,
    `S${p.rpm} M3`,
    `G0 Z${n(safe)}`,
  ]
  for (let layer = 1; layer <= layers; layer++) {
    const cutZ = p.top - Math.min(p.removal, layer * p.stepdown)
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
