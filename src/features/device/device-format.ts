import type { Axis } from "@/machine/contract"

/** A telemetry number at `digits` decimals; an em dash while it is unknown. */
export const numberText = (value: number | null | undefined, digits = 0) =>
  value == null
    ? "—"
    : value.toLocaleString("en", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      })

/** An axis as its telemetry object keys it. */
export const axisKey = (axis: Axis) => axis.toLowerCase() as "x" | "y" | "z"

/** The tool in the spindle: its number, None without one, a dash while unknown. */
export function toolText(tool: number | null | undefined) {
  if (tool == null) return "—"
  return tool < 0 ? "None" : `T${tool}`
}
