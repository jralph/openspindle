import { ArrowDownToLine, LandPlot, SquareDashed } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { OPERATION_KINDS, probingOf } from "@/domain/operations/kinds"
import type { ProbingSourceKind } from "@/domain/operations/kinds"
import {
  useAddProbingOperation,
  useProbeForAdding,
} from "./use-add-probing-operation"

/** An operation OpenSpindle generates itself, as Add operation and the Prepare toolbar offer it. */
export type BuiltInSource = {
  readonly id: string
  readonly icon: LucideIcon
  readonly title: string
  readonly description: string
  /** Adds the operation and selects it; false when it was not added. */
  readonly add: () => boolean
}

const PROBING_KINDS: readonly ProbingSourceKind[] = [
  "auto-level",
  "auto-z-height",
  "auto-scan",
]

const PROBING_ICONS: Record<ProbingSourceKind, LucideIcon> = {
  "auto-level": LandPlot,
  "auto-z-height": ArrowDownToLine,
  "auto-scan": SquareDashed,
}

const PROBING_DESCRIPTIONS: Record<ProbingSourceKind, string> = {
  "auto-level":
    "Probe the stock surface; the job pauses to review the height map.",
  "auto-z-height": "Touch the stock top with the probe and set work Z there.",
  "auto-scan": "Trace the edges of the plate's work area before cutting.",
}

/** The probing operations of the machine's probe: none without a probe, auto-scan if it traces. */
export function useBuiltInSources(): BuiltInSource[] {
  const probe = useProbeForAdding()
  const addAutoLevel = useAddProbingOperation("auto-level")
  const addAutoZHeight = useAddProbingOperation("auto-z-height")
  const addAutoScan = useAddProbingOperation("auto-scan")
  const add: Record<ProbingSourceKind, () => boolean> = {
    "auto-level": addAutoLevel,
    "auto-z-height": addAutoZHeight,
    "auto-scan": addAutoScan,
  }
  return PROBING_KINDS.filter((kind) => probingOf(kind).available(probe)).map(
    (kind) => ({
      id: kind,
      icon: PROBING_ICONS[kind],
      title: OPERATION_KINDS[kind].label,
      description: PROBING_DESCRIPTIONS[kind],
      add: add[kind],
    })
  )
}
