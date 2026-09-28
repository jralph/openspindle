import type { CompiledPlate } from "@/domain/compile/compile"
import type { PreparedProgram } from "@/machine/contract"
import { useProgramCheck } from "@/platform/machine"

/** What the connected firmware's dialect makes of a compiled program. */
export type ProgramCheck =
  | { readonly status: "unavailable"; readonly reason: string }
  | { readonly status: "checking" }
  | { readonly status: "rejected"; readonly error: string }
  | { readonly status: "ready"; readonly program: PreparedProgram }

/** The dialect check of a compiled plate. An empty program is never sent, so never checked. */
export function useCompiledProgramCheck(
  compiled: CompiledPlate | null
): ProgramCheck {
  const source =
    compiled && compiled.mode !== "empty" ? compiled.program.source : null
  const { data, error } = useProgramCheck(source)
  if (source === null)
    return { status: "unavailable", reason: "There is no program to check." }
  if (data)
    return data.ok
      ? { status: "ready", program: data.program }
      : { status: "rejected", error: data.error }
  if (error) return { status: "rejected", error: error.message }
  return { status: "checking" }
}

/** The prepared program when the check succeeded; stable while the check is unchanged. */
export const preparedProgram = (check: ProgramCheck) =>
  check.status === "ready" ? check.program : null

/** The lines the machine executes, numbered like the source (the dialect keeps one per line). */
export const preparedLines = (program: PreparedProgram) =>
  program.text.replace(/\n$/, "").split("\n")
