import { z } from "zod"
import { COORDINATE_LIMIT, hasControlCharacter } from "@/machine/contract"
import type { Point3 } from "@/domain/nc/gcode"

export type { Point3 }

/** Plate and machine coordinates are bounded to ±10 m, defined once in the machine contract. */
export { COORDINATE_LIMIT }

/** Millimetres to three decimals, as fields show them, without float noise or −0. */
export const toMicrometre = (value: number) => Number(value.toFixed(3)) + 0

/** The length limit of user-visible names. */
export const TEXT_LIMIT = 200

/**
 * A name as typed or pasted: control characters (tabs, line breaks) become spaces, and it is
 * trimmed to the name limit. Empty when nothing printable remains.
 */
export function normalizeText(value: string): string {
  let text = ""
  for (const character of value)
    text += hasControlCharacter(character) ? " " : character
  return text.trim().slice(0, TEXT_LIMIT).trimEnd()
}

/** Null when the value satisfies the schema, otherwise the first reason it does not. */
export function schemaIssue(schema: z.ZodType, value: unknown): string | null {
  const checked = schema.safeParse(value)
  if (checked.success) return null
  const issue = checked.error.issues.at(0)
  if (!issue) return "It is not valid."
  const path = issue.path.length ? ` (${issue.path.join(".")})` : ""
  return `${issue.message}${path}`
}

/** User-visible names and identifiers: 1–200 characters without control characters. */
export const TextSchema = z
  .string()
  .trim()
  .min(1)
  .max(TEXT_LIMIT)
  .refine((text) => !hasControlCharacter(text), "Remove control characters.")

export const EntityIdSchema = z
  .string()
  .min(1)
  .max(200)
  .refine((text) => !hasControlCharacter(text), "Invalid identifier.")

export const CoordinateSchema = z
  .number()
  .min(-COORDINATE_LIMIT)
  .max(COORDINATE_LIMIT)

export const Point3Schema = z.tuple([
  CoordinateSchema,
  CoordinateSchema,
  CoordinateSchema,
])

/** NC tool numbers: T0 is the probe slot. */
export const ToolNumberSchema = z.int().min(0).max(999999)

/** A tool table number in a message: T3, or the program's tool (NC that selects none). */
export const toolNumberText = (number: number | null) =>
  number === null ? "the program's tool" : `T${number}`

/** Starts a message with a word that may be lower case. */
export const capitalize = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1)

/** "1 file", "3 files": a count with a noun that takes a plain "s". */
export const plural = (count: number, noun: string) =>
  `${count} ${noun}${count === 1 ? "" : "s"}`

/** "812 bytes", "34 KB", "2.1 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export type Result<TValue, TError = string> =
  | { readonly ok: true; readonly value: TValue }
  | { readonly ok: false; readonly error: TError }

export const ok = <TValue>(value: TValue): Result<TValue, never> => ({
  ok: true,
  value,
})
export const fail = <TError>(error: TError): Result<never, TError> => ({
  ok: false,
  error,
})

export const newId = () => crypto.randomUUID()
