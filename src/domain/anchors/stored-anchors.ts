import { z } from "zod"
import type { AnchorConfiguration } from "@/machine/contract"
import {
  COORDINATE_LIMIT,
  CoordinateSchema,
  EntityIdSchema,
  TextSchema,
} from "@/domain/primitives"

/** X and Y in millimetres, on the bed or the machine, bounded like bed coordinates. */
export const AnchorXYSchema = z.tuple([CoordinateSchema, CoordinateSchema])
export type AnchorXY = z.infer<typeof AnchorXYSchema>

/** A position the machine stores: its id, which never changes, its name and machine XY. */
export const StoredAnchorSchema = z.object({
  id: EntityIdSchema,
  name: TextSchema,
  machinePosition: AnchorXYSchema,
})
export type StoredAnchor = z.infer<typeof StoredAnchorSchema>

/** The most anchors a setup keeps, as many as a machine reports. */
export const ANCHOR_LIMIT = 32

/**
 * A snapshot of a machine's anchors, as plates and device profiles keep it: the kit's factory
 * defaults, or a read of the device, which names the device and when it was read.
 */
export const StoredAnchorSetupSchema = z
  .object({
    version: z.literal(1),
    deviceId: EntityIdSchema.nullable(),
    source: z.enum(["factory", "firmware-config"]),
    fetchedAt: z.number().min(0).optional(),
    /** The first anchor's physical XY in the bundled bed's coordinate frame. */
    anchor1BedPosition: AnchorXYSchema,
    anchors: z.array(StoredAnchorSchema).min(1).max(ANCHOR_LIMIT),
  })
  .superRefine((setup, context) => {
    if (
      setup.source === "firmware-config" &&
      (setup.deviceId === null || setup.fetchedAt === undefined)
    )
      context.addIssue({
        code: "custom",
        message:
          "Anchors read from a device need its id and the time of the read.",
        path: ["source"],
      })
    const ids = new Set(setup.anchors.map((anchor) => anchor.id))
    if (ids.size !== setup.anchors.length)
      context.addIssue({
        code: "custom",
        message: "Anchor ids repeat.",
        path: ["anchors"],
      })
    if (!bedAnchors(setup).every((anchor) => isAnchorXY(anchor.position)))
      context.addIssue({
        code: "custom",
        message: `The anchors lie more than ${COORDINATE_LIMIT} mm from the bed's origin.`,
        path: ["anchor1BedPosition"],
      })
  })
export type StoredAnchorSetup = z.infer<typeof StoredAnchorSetupSchema>
export type BedAnchor = { id: string; name: string; position: AnchorXY }

export const isAnchorXY = (value: unknown): value is AnchorXY =>
  AnchorXYSchema.safeParse(value).success

export const isStoredAnchorSetup = (
  value: unknown
): value is StoredAnchorSetup =>
  StoredAnchorSetupSchema.safeParse(value).success

/**
 * The anchors read from a device, placed on the bed by where its first anchor is there; without
 * that position, the first anchor is at the bed's origin.
 */
export function anchorsFromDevice(
  configuration: AnchorConfiguration,
  deviceId: string,
  anchor1BedPosition: AnchorXY = [0, 0]
): StoredAnchorSetup {
  return {
    version: 1,
    deviceId,
    source: "firmware-config",
    fetchedAt: configuration.fetchedAt,
    anchor1BedPosition: [...anchor1BedPosition],
    anchors: configuration.anchors.map((anchor) => ({
      id: anchor.id,
      name: anchor.name,
      machinePosition: [anchor.x, anchor.y],
    })),
  }
}

export function bedAnchors(setup?: StoredAnchorSetup): BedAnchor[] {
  if (!setup?.anchors.length) return []
  const reference = setup.anchors[0].machinePosition
  return setup.anchors.map((anchor) => ({
    id: anchor.id,
    name: anchor.name,
    position: [0, 1].map((axis) =>
      Number(
        (
          anchor.machinePosition[axis] -
          reference[axis] +
          setup.anchor1BedPosition[axis]
        ).toFixed(6)
      )
    ) as AnchorXY,
  }))
}

/** A bed anchor's name, marked the same way wherever the factory defaults gave it. */
export function anchorDisplayName(
  anchor: Pick<BedAnchor, "name">,
  factory: boolean
): string {
  return `${anchor.name}${factory ? " (default)" : ""}`
}
