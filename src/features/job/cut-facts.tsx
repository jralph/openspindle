import { toViewerPlate } from "@/features/viewer/viewer-plate"
import { useWorkspace } from "@/app/workspace/workspace-context"
import type { ViewerToolRun } from "@/components/workspace/viewer/viewer-input"
import { lineCut } from "@/domain/tools/cut-engagement"
import type { LineCut, LineCutKind } from "@/domain/tools/cut-engagement"
import type { Tool } from "@/domain/tools/tool"
import { HeightMapFacts } from "@/components/workspace/height-map-grid"
import type { JobSubject } from "./job-view"
import type { CutPrediction } from "./use-cut-prediction"

const millimetres = (value: number) => `${value.toFixed(3)} mm`

/** The depth of cut of a line that removes nothing, by what it does instead. */
const NOT_CUTTING: Record<Exclude<LineCutKind, "cut">, string> = {
  none: "—",
  rapid: "Rapid move",
  probe: "Probing",
  air: "Not cutting",
  unknown: "Tool shape unknown",
}

/** The run of the tool in the spindle at `line`; runs are in program order. */
function runOnLine(runs: readonly ViewerToolRun[], line: number) {
  let low = 0
  let high = runs.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (runs[middle].lineEnd < line) low = middle + 1
    else high = middle
  }
  const run = runs.at(low)
  return run && run.lineStart <= line ? run : undefined
}

/** "T2 · name" for the tool in the spindle at `line`, as the plate's tool table names it. */
function toolText(
  subject: JobSubject,
  tools: readonly Tool[],
  runs: readonly ViewerToolRun[],
  line: number
): string {
  const run = line > 0 ? runOnLine(runs, line) : undefined
  if (!run) return "—"
  const toolId = subject.plate.tools.find(
    (entry) => entry.number === run.tool
  )?.toolId
  const name = tools.find((tool) => tool.id === toolId)?.name
  const number = run.tool === null ? null : `T${run.tool}`
  return [number, name].filter((part) => !!part).join(" · ") || "—"
}

/** The facts' values for a line, or what stands in for them before they are known. */
function cutValues(prediction: CutPrediction | null, line: number) {
  if (!prediction || line <= 0) return { depth: "—", width: "—", below: "—" }
  if (prediction.status === "calculating")
    return { depth: "Calculating…", width: "Calculating…", below: "—" }
  if (prediction.status === "failed")
    return { depth: "Unavailable", width: "Unavailable", below: "—" }
  const cut: LineCut = lineCut(prediction.engagement, line)
  return {
    depth: cut.kind === "cut" ? millimetres(cut.depth) : NOT_CUTTING[cut.kind],
    width: cut.kind === "cut" ? millimetres(cut.width) : "—",
    below:
      cut.belowTop !== null && cut.belowTop > 0.0005
        ? millimetres(cut.belowTop)
        : "—",
  }
}

/**
 * The cut at the timeline's line: the tool in the spindle, the depth and width of cut the
 * sweep of the stock predicts for the line's moves, and how far below the stock top they
 * leave the tool's tip.
 */
export function CutFacts({
  subject,
  prediction,
  line,
}: {
  subject: JobSubject | null
  prediction: CutPrediction | null
  /** The line on show; 0 while the whole program shows. */
  line: number
}) {
  const library = useWorkspace((state) => state.tools)
  const tools = subject?.tools ?? library
  const runs = subject
    ? toViewerPlate(subject.plate, subject.compiled, tools).tools
    : []
  const values = cutValues(prediction, line)
  const tool = subject ? toolText(subject, tools, runs, line) : "—"
  return (
    <HeightMapFacts
      facts={[
        {
          label: "Tool",
          value: (
            <span className="block truncate" title={tool}>
              {tool}
            </span>
          ),
        },
        { label: "Depth of cut", value: values.depth },
        { label: "Width of cut", value: values.width },
        { label: "Below stock top", value: values.below },
      ]}
    />
  )
}
