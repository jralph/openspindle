import { textSchema } from "./text.ts"

/**
 * One path segment: no leading dot (hidden files, `..`), no trailing dot, ASCII letters,
 * digits and `_ - +` (as in `licenses/gtk+`), with dots inside.
 */
const SEGMENT = "[a-zA-Z0-9_+-]+(?:[a-zA-Z0-9_.+-]*[a-zA-Z0-9_+-])?"
const WINDOWS_RESERVED = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i
const MAX_DEPTH = 16

export const PATH_EXTENSIONS = {
  template: ["nc", "cnc", "gcode", "tap", "ngc"],
  script: ["js", "mjs"],
  nodeEntry: ["js", "mjs", "cjs"],
  styles: ["css"],
} as const

function pathPattern(extensions: readonly string[] | null): RegExp {
  const suffix = extensions ? `\\.(?:${extensions.join("|")})` : ""
  return new RegExp(`^${SEGMENT}(?:/${SEGMENT})*${suffix}$`)
}

/**
 * A package-relative POSIX path: no absolute paths, traversal, backslashes, URL escapes,
 * hidden segments or names Windows cannot store.
 */
export function isPackagePath(
  value: string,
  extensions: readonly string[] | null = null
): boolean {
  const segments = value.split("/")
  return (
    value.length <= 240 &&
    segments.length <= MAX_DEPTH &&
    pathPattern(extensions).test(value) &&
    !segments.some(
      (segment) =>
        segment === "." || segment === ".." || WINDOWS_RESERVED.test(segment)
    )
  )
}

/** Paths that differ only by case collide on the default macOS and Windows file systems. */
export const pathKey = (path: string) => path.toLowerCase()

export const packagePathSchema = (
  label: string,
  extensions: readonly string[] | null,
  message: string
) =>
  textSchema(label, 240).refine(
    (path) => isPackagePath(path, extensions),
    message
  )
