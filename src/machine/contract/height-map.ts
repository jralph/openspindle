import { z } from "zod"
import { COORDINATE_LIMIT } from "./primitives.ts"

export const HEIGHT_MAP_LIMITS = {
  axisSamples: 255,
  samples: 16384,
  responseBytes: 128 * 1024,
} as const

const Sample = z.number().min(-COORDINATE_LIMIT).max(COORDINATE_LIMIT)

/** Relative grid compensation as reported by the machine, never absolute machine Z. */
export const HeightMapSchema = z
  .object({
    columns: z.int().min(1).max(HEIGHT_MAP_LIMITS.axisSamples),
    rows: z.int().min(1).max(HEIGHT_MAP_LIMITS.axisSamples),
    heights: z.array(z.array(Sample.nullable())),
    /** Millimetre offsets from the grid start, in the same order as heights. */
    xCoordinates: z.array(Sample).nullable(),
    yCoordinates: z.array(Sample).nullable(),
    raw: z.string().max(HEIGHT_MAP_LIMITS.responseBytes),
    receivedAt: z.number().nonnegative(),
    deviceId: z.string().min(1).max(256),
  })
  .refine(
    (map) =>
      map.columns * map.rows <= HEIGHT_MAP_LIMITS.samples &&
      map.heights.length === map.rows &&
      map.heights.every((row) => row.length === map.columns) &&
      (map.xCoordinates === null || map.xCoordinates.length === map.columns) &&
      (map.yCoordinates === null || map.yCoordinates.length === map.rows),
    "Height map dimensions are inconsistent."
  )
export type HeightMap = z.infer<typeof HeightMapSchema>
