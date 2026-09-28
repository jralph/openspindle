import type { z } from "zod"

/** Where a value sits in JSON data: the object keys and array indices that lead to it. */
export type ValuePath = readonly PropertyKey[]

/** What the schema read, less `leftOut`, or why it could not read the data even so. */
export type OptimisticRead<T> =
  | {
      readonly success: true
      readonly data: T
      /** The input's keys and array items that `data` does not keep. */
      readonly leftOut: readonly ValuePath[]
    }
  | { readonly success: false; readonly error: z.ZodError<T> }

const isRecord = (value: unknown): value is Record<PropertyKey, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/** `value` without the object key `path` ends in, copied along the path; as it is without one. */
function without(value: unknown, path: ValuePath): unknown {
  if (!path.length) return value
  const [head, ...rest] = path
  if (Array.isArray(value)) {
    if (typeof head !== "number" || head >= value.length || !rest.length)
      return value
    const item = without(value[head], rest)
    return item === value[head]
      ? value
      : value.map((entry, index) => (index === head ? item : entry))
  }
  if (!isRecord(value) || !Object.hasOwn(value, head)) return value
  if (!rest.length) {
    const { [head]: _removed, ...kept } = value
    return kept
  }
  const item = without(value[head], rest)
  return item === value[head] ? value : { ...value, [head]: item }
}

/** The paths of `input`'s keys and array items that `output` does not have. */
function notKept(
  input: unknown,
  output: unknown,
  path: ValuePath = []
): ValuePath[] {
  if (input === output) return []
  if (Array.isArray(input) && Array.isArray(output))
    return input.flatMap((item, index) =>
      index < output.length
        ? notKept(item, output[index], [...path, index])
        : [[...path, index]]
    )
  if (isRecord(input) && isRecord(output))
    // Own keys only: a key named like an Object.prototype member is not kept by inheriting it.
    return Object.entries(input).flatMap(([key, item]) =>
      !Object.hasOwn(output, key) || output[key] === undefined
        ? [[...path, key]]
        : notKept(item, output[key], [...path, key])
    )
  // A value the schema rewrote, even into another kind of value, is how it reads it.
  return []
}

/**
 * Reads data that another version may have written, optimistically. The schema's result is
 * taken as it returns it, whatever it upgraded or normalised. Keys the schema refuses as
 * unrecognized are left out and the data is read again, so only data it cannot read even
 * without them fails. `leftOut` lists what the result does not keep: those keys, and any
 * key or array item the schema dropped itself.
 */
export function readOptimistically<TSchema extends z.ZodType>(
  schema: TSchema,
  input: unknown
): OptimisticRead<z.output<TSchema>> {
  let value = input
  for (;;) {
    const parsed = schema.safeParse(value)
    if (parsed.success)
      return {
        success: true,
        data: parsed.data,
        leftOut: notKept(input, parsed.data),
      }
    const unrecognized = parsed.error.issues.flatMap((issue) =>
      issue.code === "unrecognized_keys"
        ? issue.keys.map((key) => [...issue.path, key])
        : []
    )
    const next = unrecognized.reduce<unknown>(
      (current, path) => without(current, path),
      value
    )
    // Nothing more to leave out: the schema cannot read the data.
    if (next === value) return { success: false, error: parsed.error }
    value = next
  }
}

/** A path as a person reads it: keys as they are, array items by their name, else number. */
export function describePath(input: unknown, path: ValuePath): string {
  const parts: string[] = []
  let value = input
  for (const segment of path) {
    const item: unknown =
      Array.isArray(value) || isRecord(value)
        ? (value as Record<PropertyKey, unknown>)[segment]
        : undefined
    const name =
      isRecord(item) && typeof item.name === "string" ? item.name.trim() : ""
    if (!Array.isArray(value) || typeof segment !== "number")
      parts.push(String(segment))
    else parts.push(name ? `"${name}"` : String(segment + 1))
    value = item
  }
  return parts.join(" › ")
}
