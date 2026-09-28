import { z } from "zod"

/** "device" keeps whatever the machine is set to; explicit modes persist after the job. */
export const AssistModeSchema = z.enum(["device", "on", "off"])
export type AssistMode = z.infer<typeof AssistModeSchema>

export const ASSIST_KEYS = ["vacuum", "blow", "bedClean", "antiStatic"] as const
export type AssistKey = (typeof ASSIST_KEYS)[number]

export const PlateAssistsSchema = z.strictObject({
  vacuum: AssistModeSchema,
  blow: AssistModeSchema,
  bedClean: AssistModeSchema,
  antiStatic: AssistModeSchema,
})
export type PlateAssists = z.infer<typeof PlateAssistsSchema>

export const DEVICE_ASSISTS: PlateAssists = {
  vacuum: "device",
  blow: "device",
  bedClean: "device",
  antiStatic: "device",
}

export const ASSIST_LABELS: Record<AssistKey, string> = {
  vacuum: "Vacuum",
  blow: "Air blow",
  bedClean: "Bed cleaning",
  antiStatic: "Anti-static",
}
