import { z } from "zod"
import { AnchorConfigurationSchema } from "@/machine/contract"
import type { AnchorConfiguration } from "@/machine/contract"
import { EntityIdSchema } from "../primitives"

/** A calibration's intended anchor and configuration when its job was prepared. */
export const AnchorCalibrationSchema = z.strictObject({
  anchorId: EntityIdSchema,
  deviceId: z.string().min(1).max(500),
  expectedAnchors: AnchorConfigurationSchema,
})
export type AnchorCalibration = z.infer<typeof AnchorCalibrationSchema>

/** Rereading identical settings is not a calibration change; read timestamps are provenance. */
export function calibrationAnchorsMatch(
  expected: AnchorConfiguration,
  actual: AnchorConfiguration
) {
  return (
    JSON.stringify({
      anchors: expected.anchors,
      added: expected.added ?? [],
    }) ===
    JSON.stringify({ anchors: actual.anchors, added: actual.added ?? [] })
  )
}
