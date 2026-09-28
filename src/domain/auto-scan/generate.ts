import { roundOutward } from "../compile/cutting-bounds"
import type { ToolpathBoundsResult } from "../compile/cutting-bounds"
import type { OutlineTrace } from "../probing/probe"
import type { AutoScanParams } from "./params"
import { planAutoScan } from "./rules"
import type { AutoScanIssue } from "./rules"

export type AutoScanProgram = {
  /** Newline-terminated NC from the machine's probe. */
  nc: string
}

export type AutoScanGeneration =
  | { ok: true; program: AutoScanProgram }
  | { ok: false; issues: AutoScanIssue[] }

/**
 * The complete NC of an auto-scan operation: the machine's probe tracing the plate's toolpath
 * bounds, rounded outwards, with the operation's parameters.
 */
export function generateAutoScanNc(
  params: AutoScanParams,
  toolpath: ToolpathBoundsResult,
  trace: OutlineTrace
): AutoScanGeneration {
  const plan = planAutoScan(params, toolpath, trace.parameters)
  if (!plan.ok) return plan
  return {
    ok: true,
    program: { nc: trace.program(plan.params, roundOutward(plan.outline)) },
  }
}
