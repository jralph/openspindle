import { isSimulator, readNcBlock, programParts } from "../../contract/index.ts"
import type { FirmwareAdapter } from "../adapter.ts"

const PROBE_QUARANTINE =
  "Physical probing is disabled after a probe collision: the trigger path is unverified. Use the simulator only; there is no override."
const FILE_EXECUTION_QUARANTINE =
  "File and macro execution commands are disabled during the probing quarantine. Run a reviewed program from Job so its contents can be checked."

/** Only exact, read-only shell queries may bypass the plain-NC parser. */
const READ_ONLY_SHELL = /^(?:model|diagnose|version|help)$/i
const READ_ONLY_CONFIG = /^config-get (?:sd|cached) [a-zA-Z0-9_.-]+$/

/**
 * Checks the text that can reach the firmware, including malformed console input.
 * Do not rely on lexer words alone: an invalid block deliberately has no words.
 * Integer command families cover every written subcode (M480.10 included).
 */
function textExecutionIssue(source: string): string | null {
  for (const [index, line] of source.split(/\r\n?|\n/).entries()) {
    const block = readNcBlock(line)
    const code = block.code
    // Scan even message text conservatively: firmware dispatch can split a line
    // at another command. Invalid/comment syntax is refused below, never forwarded.
    for (const word of code.matchAll(
      /([GMT])\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))/gi
    )) {
      const letter = word[1].toUpperCase()
      const number = Number(word[2])
      const family = Math.trunc(Math.abs(number))
      const probe =
        (letter === "M" && [480, 491, 495].includes(family)) ||
        (letter === "G" && [29, 30, 31, 32, 38].includes(family)) ||
        (letter === "T" && family === 9999)
      if (probe) return `Line ${index + 1}: ${PROBE_QUARANTINE}`
      if (
        (letter === "M" && [23, 24, 32, 97, 98, 99, 601].includes(family)) ||
        (letter === "G" && [65, 66].includes(family))
      )
        return `Line ${index + 1}: ${FILE_EXECUTION_QUARANTINE}`
    }
    if (READ_ONLY_SHELL.test(code) || READ_ONLY_CONFIG.test(code)) continue
    if (block.problem)
      return `Line ${index + 1}: Unrecognized or malformed commands are disabled during the probing quarantine. Only plain NC and supported read-only diagnostic shell queries are accepted.`
  }
  return null
}

/** Expensive text scanning belongs to preparation's worker, not the Stop/status event loop. */
export const assessMakeraPhysicalProgram: NonNullable<
  FirmwareAdapter["assessPhysicalProgram"]
> = (source, program) => {
  const issue = textExecutionIssue(source) ?? textExecutionIssue(program.text)
  if (issue) return issue
  for (const part of programParts(program)) {
    const extraIssue = textExecutionIssue(
      [...part.before, ...part.after].join("\n")
    )
    if (extraIssue) return extraIssue
  }
  return null
}

/** Connection admission never scans a prepared program again or trusts caller-supplied metadata. */
export const makeraExecutionIssue: NonNullable<
  FirmwareAdapter["executionIssue"]
> = (input) => {
  if (input.device && isSimulator(input.device)) return null
  if (input.kind === "console") return textExecutionIssue(input.source)
  if (!input.program)
    return "Resume is disabled for a physical program this connection does not own and cannot inspect during the probing quarantine. Stop remains available."
  if (input.program.physicalExecutionIssue === undefined)
    return "This program has no trusted physical execution assessment. Prepare it again before Run or Resume."
  return input.program.physicalExecutionIssue
}
