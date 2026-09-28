import { useMemo, useState } from "react"
import { BedViewer } from "@/components/workspace/bed-viewer"
import type {
  ArrangeMenuRequest,
  ArrangePick,
  ArrangeView,
} from "@/components/workspace/bed-viewer"
import {
  useCompiledPlate,
  useSelectedPlate,
} from "@/app/workspace/workspace-context"
import {
  ViewerToolbar,
  useViewerCamera,
} from "@/features/viewer/viewer-toolbar"
import { useWorkspaceViewerPlates } from "@/features/viewer/workspace-viewer-plates"
import {
  shownViolation,
  useDesignRuleResults,
} from "@/features/design-rules/design-rule-check"
import { DesignRuleResults } from "@/features/design-rules/design-rule-results"
import { ArrangeHint } from "./arrange/arrange-hint"
import { ArrangeMenu } from "./arrange/arrange-menu"
import { useArrange, useArrangeTarget } from "./arrange/arrange-state"
import { useArrangeEvents } from "./arrange/use-arrange-events"
import { useArrangeShortcuts } from "./arrange/use-arrange-shortcuts"
import { usePrepareSelection } from "./plate-tree/use-prepare-selection"
import { selectedSections, useSectionSelection } from "./selection"
import { PrepareToolbar } from "./prepare-toolbar"

const NO_PICK: ArrangePick = { from: null, notice: null }

/**
 * Program lines to highlight: the selected sections, else the design rule violation shown from
 * the check results while its operation stays selected, else the selected operation.
 */
function useHighlightedLines() {
  const plate = useSelectedPlate()
  const compiled = useCompiledPlate(plate)
  const selection = useSectionSelection()
  const { operationId } = usePrepareSelection()
  const violation = shownViolation(useDesignRuleResults(), plate)
  return useMemo(() => {
    if (!plate || !compiled) return []
    const sections = selectedSections(plate, compiled, selection)
    if (sections.length)
      return sections.map((section) => ({
        start: section.startLine,
        end: section.endLine,
      }))
    if (violation && (violation.operationId ?? null) === operationId)
      return violation.lines.map((lines) => ({ ...lines }))
    const span = compiled.spans.find((item) => item.operationId === operationId)
    return span ? [{ start: span.startLine, end: span.endLine }] : []
  }, [plate, compiled, selection, operationId, violation])
}

/**
 * Every plate on the bed; the selected plate's operation or sections are highlighted. Its
 * setup items can be selected, and moved with the move tool.
 */
export function PrepareViewer() {
  const plates = useWorkspaceViewerPlates()
  const plate = useSelectedPlate()
  const selection = usePrepareSelection()
  const camera = useViewerCamera()
  const highlighted = useHighlightedLines()
  const arrange = useArrange()
  const target = useArrangeTarget()
  const [menu, setMenu] = useState<ArrangeMenuRequest | null>(null)
  const [pick, setPick] = useState<ArrangePick>(NO_PICK)
  const events = useArrangeEvents({ menu: setMenu, pick: setPick })
  const arrangement = useMemo<ArrangeView>(
    () => ({
      selection: target ? arrange.selection : null,
      moving: arrange.moving && !!target && !target.item.fixed,
      axes: arrange.axes,
      snap: arrange.snap,
    }),
    [target, arrange]
  )
  useArrangeShortcuts(target)
  return (
    <div className="relative h-full min-h-0 overflow-hidden bg-muted/20">
      <BedViewer
        plates={plates}
        selectedPlateId={plate?.id ?? null}
        onSelectPlate={selection.selectPlate}
        selectedLineRanges={highlighted}
        progress={100}
        showRapids={false}
        showStock
        view={camera.view}
        resetKey={camera.resetKey}
        zoom={camera.zoom}
        onZoomChange={camera.setZoom}
        arrangement={arrangement}
        onArrange={events}
      />
      <PrepareToolbar />
      <DesignRuleResults />
      <ViewerToolbar camera={camera} />
      <ArrangeHint target={target} pick={pick} />
      <ArrangeMenu
        request={menu}
        target={target}
        onClose={() => setMenu(null)}
      />
    </div>
  )
}
