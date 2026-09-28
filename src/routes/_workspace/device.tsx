import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"
import { DevicePage } from "@/features/device/device-page"

export const DEVICE_SECTIONS = [
  "controls",
  "anchors",
  "fixtures",
  "camera",
] as const

const DeviceSearchSchema = z.object({
  section: z.enum(DEVICE_SECTIONS).optional().catch(undefined),
})
export type DeviceSearch = z.infer<typeof DeviceSearchSchema>

export const Route = createFileRoute("/_workspace/device")({
  validateSearch: DeviceSearchSchema,
  component: DevicePage,
})
