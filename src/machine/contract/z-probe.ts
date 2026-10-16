import { z } from "zod"
import { ProbeSearchTravelSchema, ProbeTopGapSchema } from "./probe-safety.ts"

/** Manual near-surface setup; distances limit travel rather than probe compression. */
export const ZProbeSettingsSchema = z
  .strictObject({
    gap: ProbeTopGapSchema,
    travel: ProbeSearchTravelSchema,
    clearance: z.number().finite().min(0.5).max(10),
  })
  .refine((value) => value.travel > value.gap, {
    path: ["travel"],
    message: "Maximum search must exceed the estimated surface gap.",
  })
export type ZProbeSettings = z.infer<typeof ZProbeSettingsSchema>
