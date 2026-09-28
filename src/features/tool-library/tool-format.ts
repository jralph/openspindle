const nameCollator = new Intl.Collator("en-US", { sensitivity: "base" })
/** A size in a name: "1-1/4", "3/8", "0.25" or "12". */
const NAME_SIZE = /\d+-\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?/g
const nameParts = new Map<string, (string | number)[]>()

function sizeValue(size: string): number {
  const [whole, fraction] = size.includes("-") ? size.split("-") : ["0", size]
  if (!fraction.includes("/")) return Number(size)
  const [numerator, denominator] = fraction.split("/").map(Number)
  return Number(whole) + numerator / denominator
}

/**
 * A name as text and sizes, inches in millimetres so both units sort together:
 * "Drill Ø0.25 × 3 mm" → ["Drill Ø", 0.25, " × ", 3, " mm"].
 */
function splitName(name: string): (string | number)[] {
  let parts = nameParts.get(name)
  if (parts) return parts
  parts = []
  let end = 0
  for (const match of name.matchAll(NAME_SIZE)) {
    if (match.index > end) parts.push(name.slice(end, match.index))
    end = match.index + match[0].length
    const inches = name[end] === "″" || name[end] === '"'
    parts.push(sizeValue(match[0]) * (inches ? 25.4 : 1))
  }
  if (end < name.length) parts.push(name.slice(end))
  nameParts.set(name, parts)
  return parts
}

/** Tool names alphabetically, sizes by value: "Ø0.25" before "Ø0.3", "1/8″" before "1/4″". */
export function compareToolNames(a: string, b: string): number {
  const left = splitName(a)
  const right = splitName(b)
  for (let index = 0; index < Math.min(left.length, right.length); index++) {
    const x = left[index]
    const y = right[index]
    const order =
      typeof x === "number" && typeof y === "number"
        ? x - y
        : nameCollator.compare(String(x), String(y))
    if (order) return order
  }
  return left.length - right.length
}

/** "flat end mill" → "Flat End Mill". */
export const toolKindLabel = (kind: string) =>
  kind.replace(/\b\w/g, (letter) => letter.toUpperCase())

/**
 * Editor wording for a ToolSchema message, whether the full historic form
 * ("presets[0].rpm must be …") or a field's own predicate ("must be …").
 */
export function describeToolError(message: string): string {
  return message
    .replace(
      /presets\[(\d+)\]\./g,
      (_, index: string) => `Preset ${Number(index) + 1}: `
    )
    .replace(
      /(holder|shaft)\.segments\[(\d+)\]\./g,
      (_, part: string, index: string) =>
        `${part === "holder" ? "Holder" : "Shaft"} segment ${Number(index) + 1}: `
    )
    .replace(/geometry\.|postProcess\./g, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/overall Length/g, "overall length")
    .replace(/thread Pitch Max/g, "maximum thread pitch")
    .replace(/or unknown/g, "or left blank")
    .replace(/^./, (letter) => letter.toUpperCase())
}

/** The message of an Error, or a fallback for anything else that was thrown. */
export const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback
