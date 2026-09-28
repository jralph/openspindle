import {
  COORDINATE_LIMIT,
  HEIGHT_MAP_LIMITS,
  HeightMapSchema,
} from "../../contract/index.ts"
import type { HeightMap } from "../../contract/index.ts"

const NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i

function number(token: string): number {
  const value = NUMBER.test(token) ? Number(token) : NaN
  if (!Number.isFinite(value) || Math.abs(value) > COORDINATE_LIMIT)
    throw new Error("Height map contains an invalid numeric value.")
  return value
}

function samples(text: string): (number | null)[] {
  const tokens = text.trim().split(/\s+/)
  if (!text.trim() || tokens.length > HEIGHT_MAP_LIMITS.axisSamples)
    throw new Error("Height map row exceeds the supported grid size.")
  return tokens.map((token) =>
    /^[+-]?nan$/i.test(token) ? null : number(token)
  )
}

function coordinates(text: string): number[] {
  const values = samples(text)
  if (values.some((value) => value === null))
    throw new Error("Height map axes contain unavailable coordinates.")
  const axis = values as number[]
  if (axis.length > 1) {
    const direction = Math.sign(axis[1] - axis[0])
    if (
      !direction ||
      axis.some(
        (value, index) =>
          index > 0 && Math.sign(value - axis[index - 1]) !== direction
      )
    )
      throw new Error("Height map axis coordinates are not ordered.")
  }
  return axis
}

/** The complete, acknowledgement-terminated CartGridStrategy::print_bed_level response. */
export function parseMakeraHeightMap(
  raw: string,
  receivedAt: number,
  deviceId: string
): HeightMap {
  if (
    raw.length > HEIGHT_MAP_LIMITS.responseBytes ||
    [...raw].some((character) => {
      const code = character.charCodeAt(0)
      return ![9, 10, 13].includes(code) && (code < 32 || code > 126)
    })
  )
    throw new Error(
      "Height map response exceeded its limit or contains invalid text."
    )
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  if (lines.pop() !== "ok")
    throw new Error(
      "Height map response is incomplete; its acknowledgement is missing."
    )
  if (!lines.length)
    throw new Error(
      "The device did not return a height map. Rectangular grid probing may be unavailable."
    )
  let heights: (number | null)[][]
  let xCoordinates: number[] | null = null
  let yCoordinates: number[] | null = null
  if (lines[0].includes("|")) {
    const divider = lines.findIndex((line) => /^(?:-----\+-----)+$/.test(line))
    if (divider < 1 || divider !== lines.length - 2)
      throw new Error("Height map axes or rows are incomplete.")
    const ys: number[] = []
    heights = lines.slice(0, divider).map((line) => {
      const parts = line.split("|")
      if (parts.length !== 2) throw new Error("Height map row is malformed.")
      ys.push(number(parts[0].trim()))
      return samples(parts[1])
    })
    xCoordinates = coordinates(lines[divider + 1])
    yCoordinates = coordinates(ys.join(" "))
    if (lines[divider].length !== xCoordinates.length * 11)
      throw new Error("Height map axis divider does not match its columns.")
  } else heights = lines.map(samples)
  const result = HeightMapSchema.safeParse({
    columns: heights[0].length,
    rows: heights.length,
    heights,
    xCoordinates,
    yCoordinates,
    raw,
    receivedAt,
    deviceId,
  })
  if (!result.success)
    throw new Error(
      "Height map dimensions are inconsistent or exceed the supported grid size."
    )
  return result.data
}
