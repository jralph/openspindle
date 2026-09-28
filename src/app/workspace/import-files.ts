import { PlateSchema } from "@/domain/plate/plate"
import type { Plate } from "@/domain/plate/plate"
import type { Operation } from "@/domain/operations/operation"
import { fail, newId, ok } from "@/domain/primitives"
import type { Result } from "@/domain/primitives"
import { boundTools } from "@/domain/tools/tool-table"
import { FILE_KINDS, hasFileExtension } from "@/platform/contract/files"
import { readTextFile } from "@/platform/read-text-file"
import { importProgram } from "./import-program"
import type { ImportContext } from "./import-program"

/** NC programs OpenSpindle imports, by file name; the file kind registry lists them. */
const NC_EXTENSIONS = FILE_KINDS.program.extensions.map(
  (extension) => `.${extension}`
)
export const NC_FILE_ACCEPT = NC_EXTENSIONS.join(",")
/** The extensions in a sentence: ".nc, .cnc, .gcode, .tap, or .ngc". */
export const NC_FILE_TYPES = new Intl.ListFormat("en", {
  type: "disjunction",
}).format(NC_EXTENSIONS)

export const isProgramFileName = (name: string) =>
  hasFileExtension("program", name)

export type FileProblem = {
  readonly fileName: string
  readonly message: string
}

/** An operation ready to add to another plate, with the library tools it had on its own. */
export type TransferableOperation = {
  readonly operation: Operation
  readonly preferredTools: ReadonlyMap<number | null, string>
}

const message = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

/** One NC file as a plate; everything a plate must satisfy is checked before it is used. */
async function readPlate(
  file: File,
  context: ImportContext
): Promise<Result<Plate>> {
  let text: string
  try {
    text = (await readTextFile("program", file)).contents
  } catch (error) {
    return fail(message(error))
  }
  const imported = importProgram(file.name, text, context)
  if (!imported.ok) return imported
  const checked = PlateSchema.safeParse(imported.value)
  if (!checked.success)
    return fail(checked.error.issues.at(0)?.message ?? "It cannot be used.")
  return ok(checked.data)
}

/** Reads NC files as new plates. A file that cannot be used is reported, never skipped silently. */
export async function readPlates(
  files: readonly File[],
  context: ImportContext
): Promise<{ plates: Plate[]; problems: FileProblem[] }> {
  const plates: Plate[] = []
  const problems: FileProblem[] = []
  for (const file of files) {
    const plate = await readPlate(file, context)
    if (plate.ok) plates.push(plate.value)
    else problems.push({ fileName: file.name, message: plate.error })
  }
  return { plates, problems }
}

/** Reads NC files as operations for an existing plate, keeping the tools each file selects. */
export async function readOperations(
  files: readonly File[],
  context: ImportContext
): Promise<{ operations: TransferableOperation[]; problems: FileProblem[] }> {
  const { plates, problems } = await readPlates(files, context)
  const operations = plates.flatMap((plate) =>
    plate.operations.map((operation) => ({
      operation: { ...operation, id: newId(), tools: [] },
      preferredTools: boundTools(plate, operation),
    }))
  )
  return { operations, problems }
}

/** A problem's message on its own, or after its file name when it does not already name it. */
const describeProblem = (problem: FileProblem) => {
  const reason = problem.message.replace(/\.$/, "")
  const named = reason.startsWith(problem.fileName)
    ? reason
    : `${problem.fileName}: ${reason}`
  return `${named}.`
}

export const describeProblems = (problems: readonly FileProblem[]) =>
  problems.map(describeProblem).join(" ")
