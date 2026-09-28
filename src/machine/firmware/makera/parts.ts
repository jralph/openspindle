import { RUN_LIMITS, readNcBlock } from "../../contract/index.ts"
import type { ProgramPart } from "../../contract/index.ts"
import { ProgramError } from "../adapter.ts"

const MiB = 1024 * 1024
const WORK_SYSTEMS = new Set([54, 55, 56, 57, 58, 59, 59.1, 59.2, 59.3])

/** What a part must restore at its first line, and whether the spindle runs there. */
type State = {
  readonly units: number | null
  readonly distance: number | null
  readonly plane: number | null
  readonly workSystem: number | null
  readonly feed: string | null
  readonly spindleOn: boolean
}

/**
 * Modal G words and the feed, as the program had set them before this line. `play` puts the
 * player in G90 and the firmware keeps the rest from the file before, but a part says them
 * itself rather than rely on what ran before it. The spindle speed needs none: a part starts
 * at a tool change, with the spindle stopped, and the dialect has put the speed the program set
 * on the M3 that starts it again.
 */
function restore(state: State): string[] {
  const modes = [state.units, state.distance, state.plane, state.workSystem]
    .filter((value) => value !== null)
    .map((value) => `G${value}`)
  return [
    ...(modes.length ? [modes.join(" ")] : []),
    ...(state.feed ? [state.feed] : []),
  ]
}

/**
 * Where the program may be cut: before each tool change (`M6` with its T word, which the
 * dialect has added where the source left it out), with the state at that line. The Z1 stops
 * the spindle for a tool change anyway, so a part ending there only stops it first.
 */
function toolChanges(lines: readonly string[]): Map<number, State> {
  const cuts = new Map<number, State>()
  let state: State = {
    units: null,
    distance: null,
    plane: null,
    workSystem: null,
    feed: null,
    spindleOn: false,
  }
  lines.forEach((code, index) => {
    const block = readNcBlock(code)
    if (block.message !== null) return
    const words = block.words.map(({ letter, value, start, end }) => ({
      letter,
      value,
      // As written, without the spaces a word may have after its letter.
      text: `${letter}${code.slice(start + 1, end).trimStart()}`,
    }))
    const m = (value: number) =>
      words.some((word) => word.letter === "M" && word.value === value)
    if (m(6) && words.some((word) => word.letter === "T"))
      cuts.set(index + 1, state)
    const next = { ...state }
    for (const { letter, value, text } of words) {
      if (letter === "F") next.feed = text
      if (letter !== "G") continue
      if (value === 20 || value === 21) next.units = value
      else if (value === 90 || value === 91) next.distance = value
      else if (value === 17 || value === 18 || value === 19) next.plane = value
      else if (WORK_SYSTEMS.has(value)) next.workSystem = value
    }
    if (m(3) || m(4)) next.spindleOn = true
    // M6 stops the spindle for the change; M2 and M30 stop it too (grbl mode's M5).
    if (m(5) || m(6) || m(2) || m(30)) next.spindleOn = false
    state = next
  })
  return cuts
}

const size = (bytes: number) => `${(bytes / MiB).toFixed(1)} MiB`

/**
 * The files a prepared program is sent as: one with every line when it fits a file, else
 * parts cut before tool changes, each holding as many whole tool changes' work as fits. A
 * part after the first restores the modal state at its cut; a part ending with the spindle
 * on stops it, so the machine reports the part finished and idle.
 */
export function makeraParts(lines: readonly string[]): ProgramPart[] {
  const { fileBytes, fileLines } = RUN_LIMITS
  // Byte offsets of each line in the prepared text, with its line feed.
  const offsets = [0]
  for (const line of lines) offsets.push(offsets.at(-1)! + line.length + 1)
  const cuts = toolChanges(lines)
  const part = (
    startLine: number,
    endLine: number,
    before: string[],
    after: string[]
  ): ProgramPart => ({
    startLine,
    endLine,
    before,
    after,
    bytes:
      offsets[endLine] -
      offsets[startLine - 1] +
      [...before, ...after].reduce((sum, line) => sum + line.length + 1, 0),
  })
  const fits = (candidate: ProgramPart) =>
    candidate.bytes <= fileBytes &&
    candidate.before.length +
      candidate.endLine -
      candidate.startLine +
      1 +
      candidate.after.length <=
      fileLines
  const endAt = (cut: number) => (cuts.get(cut)?.spindleOn ? ["M5"] : [])
  const whole = part(1, lines.length, [], [])
  if (fits(whole)) return [whole]
  const parts: ProgramPart[] = []
  let start = 1
  let before: string[] = []
  for (;;) {
    const rest = part(start, lines.length, before, [])
    if (fits(rest)) return [...parts, rest]
    // The furthest tool change the part can reach; parts only grow with their end.
    let reached: ProgramPart | null = null
    let next: number | null = null
    for (const cut of cuts.keys()) {
      if (cut <= start) continue
      const candidate = part(start, cut - 1, before, endAt(cut))
      if (!fits(candidate)) {
        next = cut
        break
      }
      reached = candidate
    }
    if (!reached) {
      const end = next === null ? lines.length : next - 1
      const alone = part(start, end, before, [])
      throw new ProgramError(
        `Lines ${start.toLocaleString("en")}–${end.toLocaleString("en")} have no tool change between them and make a ${size(alone.bytes)} file of ${(end - start + 1).toLocaleString("en")} lines, more than the ${fileBytes / MiB} MiB and ${fileLines.toLocaleString("en")} lines the machine takes at once. A program is only split at its tool changes: split that toolpath in your CAM.`,
        start
      )
    }
    parts.push(reached)
    start = reached.endLine + 1
    before = restore(cuts.get(start)!)
  }
}
