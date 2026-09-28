import type { z } from "zod"
import { MachineSnapshotSchema } from "../contract/index.ts"
import type { MachineSnapshot } from "../contract/index.ts"

/** More than a snapshot could refuse at once; repairing stops there. */
const MAX_REPAIRS = 64

type Path = readonly PropertyKey[]
type Issues = z.ZodError["issues"]

const samePath = (a: Path, b: Path) =>
  a.length === b.length && a.every((key, index) => key === b[index])

const issuesOf = (value: unknown): Issues => {
  const result = MachineSnapshotSchema.safeParse(value)
  return result.success ? [] : result.error.issues
}

/**
 * A copy of `value` with the part at `path` (never empty) set to null or, with `remove`, taken
 * out of its list. Nothing changes in place: a snapshot shares the controller's state.
 */
function leaveOut(value: unknown, path: Path, remove: boolean): unknown {
  const [key, ...rest] = path
  if (Array.isArray(value) && typeof key === "number") {
    const copy: unknown[] = [...value]
    if (rest.length) copy[key] = leaveOut(copy[key], rest, remove)
    else if (remove) copy.splice(key, 1)
    else copy[key] = null
    return copy
  }
  if (value === null || typeof value !== "object") return value
  const record = value as Record<PropertyKey, unknown>
  return {
    ...record,
    [key]: rest.length ? leaveOut(record[key], rest, remove) : null,
  }
}

/**
 * Leaves out the nearest part of a refused value's path that the contract lets go: set to null
 * where it may be null, else taken out of its list. Null when no part of the path can go.
 */
function repair(
  value: unknown,
  path: Path
): { readonly value: unknown; readonly issues: Issues } | null {
  for (let length = path.length; length > 0; length--) {
    const at = path.slice(0, length)
    const nulled = leaveOut(value, at, false)
    const nullIssues = issuesOf(nulled)
    if (!nullIssues.some((issue) => samePath(issue.path, at)))
      return { value: nulled, issues: nullIssues }
    if (typeof at.at(-1) !== "number") continue
    const list = at.slice(0, -1)
    const removed = leaveOut(value, at, true)
    const removeIssues = issuesOf(removed)
    if (!removeIssues.some((issue) => samePath(issue.path, list)))
      return { value: removed, issues: removeIssues }
  }
  return null
}

/**
 * The snapshot as the machine contract takes it. The renderer drops a snapshot the contract
 * refuses, and so every later one while the value stays, which freezes the UI; so a refused value
 * is left out instead, by the nearest part of it the contract lets go (`repair`). `error` is the
 * contract's verdict on the snapshot as built, null when it took it whole.
 */
export function validSnapshot(snapshot: MachineSnapshot): {
  readonly snapshot: MachineSnapshot
  readonly error: z.ZodError | null
} {
  const result = MachineSnapshotSchema.safeParse(snapshot)
  if (result.success) return { snapshot, error: null }
  let value: unknown = snapshot
  let issues: Issues = result.error.issues
  for (let repairs = 0; issues.length && repairs < MAX_REPAIRS; repairs++) {
    let repaired: ReturnType<typeof repair> = null
    for (const issue of issues) {
      repaired = repair(value, issue.path)
      if (repaired) break
    }
    if (!repaired) break
    value = repaired.value
    issues = repaired.issues
  }
  return { snapshot: value as MachineSnapshot, error: result.error }
}
