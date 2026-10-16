import { z } from "zod"
import { ProbeTopGapSchema } from "./probe-safety.ts"

/** The first Z search is shortened to the live lower machine limit before execution. */
export const ZProbeSettingsSchema = z.strictObject({
  // Accept existing protected recipes; an estimated gap is no longer required or used.
  gap: ProbeTopGapSchema.optional(),
  travel: z.number().finite().min(0.4).max(105),
  clearance: z.number().finite().min(0.5).max(10),
})
export type ZProbeSettings = z.infer<typeof ZProbeSettingsSchema>
