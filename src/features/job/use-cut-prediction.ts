import { useEffect, useMemo, useState } from "react"
import { log } from "@/app/errors/log"
import { toViewerPlate } from "@/features/viewer/viewer-plate"
import { useWorkspace } from "@/app/workspace/workspace-context"
import type { ViewerToolRun } from "@/components/workspace/viewer/viewer-input"
import type { PlateSetup } from "@/domain/plate/plate"
import type { CutEngagement, CutStock } from "@/domain/tools/cut-engagement"
import { simulateProgramCuts } from "./cut-simulation"
import type { JobSubject } from "./job-view"

/** The depth and width of cut predicted for the program on show. */
export type CutPrediction =
  | { readonly status: "calculating" }
  | { readonly status: "ready"; readonly engagement: CutEngagement }
  | { readonly status: "failed" }

/** The plate's stock in its program's coordinates, which start at the work origin. */
function programStock({
  stock,
  stockAnchor,
  workOrigin,
}: PlateSetup): CutStock | null {
  if (!stock) return null
  const min: CutStock["min"] = [
    stockAnchor[0] - workOrigin[0],
    stockAnchor[1] - workOrigin[1],
    stockAnchor[2] - workOrigin[2],
  ]
  return {
    min,
    max: [min[0] + stock.width, min[1] + stock.depth, min[2] + stock.height],
  }
}

/**
 * Predictions by the tools that make a program (a new program or tool library makes new
 * runs) and by where its stock is, so showing the tab again does not sweep again.
 */
const predictions = new WeakMap<
  readonly ViewerToolRun[],
  Map<string, CutEngagement>
>()

type Request = {
  readonly runs: readonly ViewerToolRun[]
  readonly source: string
  readonly stock: CutStock | null
  readonly stockKey: string
}

const remembered = (request: Request) =>
  predictions.get(request.runs)?.get(request.stockKey) ?? null

/**
 * Predicts the depth and width of cut of every line of the subject's program, off the main
 * thread, with the tools as the viewer draws them; null without a program.
 */
export function useCutPrediction(
  subject: JobSubject | null
): CutPrediction | null {
  const library = useWorkspace((state) => state.tools)
  const plate = subject
    ? toViewerPlate(subject.plate, subject.compiled, subject.tools ?? library)
    : null
  const stock = subject ? programStock(subject.plate.setup) : null
  const stockKey = JSON.stringify(stock)
  const runs = plate?.tools ?? null
  const source = plate?.program.source ?? null
  // Equal keys hold an equal stock.
  const request = useMemo<Request | null>(
    () =>
      runs && source !== null && plate?.program.segments.length
        ? { runs, source, stock, stockKey }
        : null,
    [runs, source, stockKey]
  )
  const [settled, setSettled] = useState<{
    readonly request: Request
    readonly prediction: CutPrediction
  } | null>(null)

  useEffect(() => {
    if (!request || remembered(request)) return
    const controller = new AbortController()
    simulateProgramCuts(
      {
        source: request.source,
        spans: request.runs.map((run) => ({
          segmentStart: run.segmentStart,
          segmentEnd: run.segmentEnd,
          flutes:
            run.shape?.parts.find((part) => part.role === "flutes")?.outline ??
            null,
        })),
        stock: request.stock,
      },
      controller.signal
    ).then(
      (engagement) => {
        const byStock = predictions.get(request.runs) ?? new Map()
        byStock.set(request.stockKey, engagement)
        predictions.set(request.runs, byStock)
        setSettled({ request, prediction: { status: "ready", engagement } })
      },
      (error: unknown) => {
        if (controller.signal.aborted) return
        log.warn("Predicting the depth of cut failed", error)
        setSettled({ request, prediction: { status: "failed" } })
      }
    )
    return () => controller.abort()
  }, [request])

  if (!request) return null
  const engagement = remembered(request)
  if (engagement) return { status: "ready", engagement }
  if (settled?.request === request) return settled.prediction
  return { status: "calculating" }
}
