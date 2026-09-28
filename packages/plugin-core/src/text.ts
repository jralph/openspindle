import { z } from "zod"
import { hasControlCharacter } from "../../../src/machine/contract/index.ts"
import { PluginError } from "./errors.ts"

/** UTF-8 byte length without TextEncoder, so every host counts identically. */
export function pluginTextBytes(value: string): number {
  let size = 0
  for (const character of value) {
    const point = character.codePointAt(0) ?? 0
    if (point >= 0xd800 && point <= 0xdfff)
      throw new PluginError("Text contains an invalid Unicode character.")
    if (point < 0x80) size += 1
    else if (point < 0x800) size += 2
    else if (point < 0x10000) size += 3
    else size += 4
  }
  return size
}

/** Package text must be strict UTF-8; lossy decoding would change what was reviewed. */
export function decodeUtf8(bytes: Uint8Array, label: string): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    throw new PluginError(`${label} must be valid UTF-8 text.`)
  }
}

/** Tab, line feed and carriage return are the only control characters allowed in program text. */
export const hasProgramControlCharacter = (text: string) =>
  [...text].some((character) => {
    const code = character.charCodeAt(0)
    return (
      (code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 127
    )
  })

const textMessage = (label: string, max: number) =>
  `${label} must be non-empty text of at most ${max} characters.`

/** Non-empty, bounded, single-line display text. */
export const textSchema = (label: string, max = 1000) =>
  z
    .string({ error: textMessage(label, max) })
    .refine(
      (value) =>
        value.trim().length > 0 &&
        value.length <= max &&
        !hasControlCharacter(value),
      textMessage(label, max)
    )

/** Lowercase kebab-case IDs for plugins, programs, views and toolbar items. */
export const identifierSchema = (label: string) =>
  textSchema(label, 64).refine(
    (id) =>
      /^[a-z][a-z0-9-]*$/.test(id) &&
      id !== "constructor" &&
      id !== "prototype",
    `${label} must contain lowercase letters, digits, or hyphens.`
  )

export const finiteSchema = (label: string) => {
  const message = `${label} must be a finite number between -1000000000 and 1000000000.`
  return z
    .number({ error: message })
    .refine(
      (value) => Number.isFinite(value) && Math.abs(value) <= 1e9,
      message
    )
}

export const listSchema = <T extends z.ZodType>(
  item: T,
  label: string,
  max: number
) => {
  const message = `${label} must be an array with at most ${max} entries.`
  return z.array(item, { error: message }).max(max, message)
}

export const isUnique = (values: readonly string[]) =>
  new Set(values).size === values.length

/** A strict object whose type and unknown-field errors name what was being read. */
export const strictSchema = <TShape extends z.ZodRawShape>(
  label: string,
  shape: TShape,
  unsupported = `${label} contains an unsupported field.`
) =>
  z.strictObject(shape, {
    error: (issue) =>
      issue.code === "unrecognized_keys"
        ? unsupported
        : `${label} must be an object.`,
  })

/** A discriminated union's errors: a non-object, or an object matching no option. */
export const unionError =
  (label: string, mismatch: string) => (issue: { readonly input?: unknown }) =>
    issue.input !== null && typeof issue.input === "object"
      ? mismatch
      : `${label} must be an object.`

export const Sha256Schema = z
  .string()
  .regex(/^[a-f0-9]{64}$/, "Expected a SHA-256 digest.")

/** The first issue as a user-facing message, with its location when nested. */
export function issueMessage(error: z.ZodError): string {
  const issue = error.issues.at(0)
  if (!issue) return "The value is invalid."
  return issue.path.length
    ? `${issue.message} (${issue.path.join(".")})`
    : issue.message
}

/** Parses with a schema, throwing a PluginError with the first issue. */
export function parseWith<T extends z.ZodType>(
  schema: T,
  value: unknown
): z.output<T> {
  const result = schema.safeParse(value)
  if (result.success) return result.data
  throw new PluginError(issueMessage(result.error))
}

export function parseJson(text: string, label: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new PluginError(`${label} is not valid JSON.`)
  }
}
