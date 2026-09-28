import { Button } from "@/components/ui/button"
import { useEffect, useRef, useState } from "react"
import { useHost } from "@/platform/host-context"
import { plateLabel } from "@/domain/plate/plate"
import type { ViewerPlate } from "@/components/workspace/viewer/viewer-input"
import type { LineRange } from "./bed-viewer-layout"
import { BedScene } from "./viewer/bed-scene"
import type { ViewMode } from "./viewer/bed-scene"
import type { ArrangeEvents, ArrangeView } from "./viewer/setup-arranger"

export type { Stock } from "@/domain/stock/stock"
export type { ViewerPlate } from "@/components/workspace/viewer/viewer-input"
export type { ViewMode } from "./viewer/bed-scene"
export type {
  ArrangeDrag,
  ArrangeEvents,
  ArrangeMenuRequest,
  ArrangePick,
  ArrangeSelection,
  ArrangeView,
} from "./viewer/setup-arranger"
type Props = {
  plates: ViewerPlate[]
  selectedPlateId: string | null
  onSelectPlate: (id: string) => void
  selectedLineRanges?: LineRange[]
  previewLine?: number | null
  previewProbePoint?: number | null
  progress: number
  showRapids: boolean
  showStock: boolean
  view: ViewMode
  resetKey: number
  zoom: number
  onZoomChange?: (zoom: number) => void
  /** The selected setup item and move mode, when setup items can be selected and moved. */
  arrangement?: ArrangeView
  /** Given on the first render, it makes setup items selectable and movable. */
  onArrange?: ArrangeEvents
}

export function BedViewer({
  plates,
  selectedPlateId,
  onSelectPlate,
  selectedLineRanges,
  previewLine,
  previewProbePoint,
  progress,
  showRapids,
  showStock,
  view,
  resetKey,
  zoom,
  onZoomChange,
  arrangement,
  onArrange,
}: Props) {
  const container = useRef<HTMLDivElement>(null)
  const labels = useRef(new Map<string, HTMLButtonElement>())
  const select = useRef(onSelectPlate)
  const zoomChange = useRef(onZoomChange)
  const arrange = useRef(onArrange)
  const sceneRef = useRef<BedScene | null>(null)
  const models = useHost().models
  const [error, setError] = useState("")
  useEffect(() => {
    select.current = onSelectPlate
  }, [onSelectPlate])
  useEffect(() => {
    zoomChange.current = onZoomChange
  }, [onZoomChange])
  useEffect(() => {
    arrange.current = onArrange
  }, [onArrange])

  useEffect(() => {
    if (!container.current) return
    // The scene calls through the ref, so it always reaches the latest handlers.
    const arrangeEvents: ArrangeEvents | undefined = arrange.current && {
      select: (plateId, item) => arrange.current?.select(plateId, item),
      move: (plateId, item, delta) =>
        arrange.current?.move(plateId, item, delta) ?? false,
      menu: (request) => arrange.current?.menu(request),
      pick: (pick) => arrange.current?.pick(pick),
      drag: (drag) => arrange.current?.drag(drag),
    }
    const scene = BedScene.create(
      container.current,
      labels.current,
      {
        selectPlate: (id) => select.current(id),
        zoomChange: (value) => zoomChange.current?.(value),
        error: setError,
        arrange: arrangeEvents,
      },
      (id) => models.mesh(id)
    )
    if (!scene) {
      setError("3D view unavailable.")
      return
    }
    sceneRef.current = scene
    return () => {
      scene.dispose()
      sceneRef.current = null
    }
  }, [])

  // Presentation first, so plates added in the same render start in their final state.
  useEffect(() => {
    sceneRef.current?.present({
      selectedPlateId,
      selectedLineRanges,
      previewLine,
      previewProbePoint,
      progress,
      showRapids,
      showStock,
    })
  }, [
    selectedPlateId,
    selectedLineRanges,
    previewLine,
    previewProbePoint,
    progress,
    showRapids,
    showStock,
  ])
  // Unchanged plates keep their objects; the scene renders only when something changed.
  useEffect(() => {
    sceneRef.current?.setPlates(plates)
  }, [plates])
  // After the plates, so a selection always finds its item drawn.
  useEffect(() => {
    if (arrangement) sceneRef.current?.arrange(arrangement)
  }, [arrangement])
  useEffect(() => {
    sceneRef.current?.setView(view)
  }, [view, resetKey])
  useEffect(() => {
    sceneRef.current?.setZoom(zoom)
  }, [zoom, resetKey])

  return (
    <div
      className="absolute inset-0 overflow-hidden [&>canvas]:block"
      ref={container}
      aria-label="Interactive 3D plates and NC toolpaths"
    >
      <div className="pointer-events-none absolute inset-0 z-[1] overflow-hidden">
        {plates.map((plate, index) => {
          const label = plateLabel(plate, index)
          return (
            <Button
              variant={plate.id === selectedPlateId ? "default" : "outline"}
              className="pointer-events-auto invisible absolute -translate-x-1/2 -translate-y-1/2 shadow-sm"
              key={plate.id}
              ref={(element) => {
                if (element) labels.current.set(plate.id, element)
                else labels.current.delete(plate.id)
              }}
              type="button"
              aria-label={`Select ${label}`}
              aria-pressed={plate.id === selectedPlateId}
              title={label}
              onClick={() => onSelectPlate(plate.id)}
            >
              <span className="truncate">{label}</span>
            </Button>
          )
        })}
      </div>
      {error && (
        <div className="absolute bottom-4 left-4 rounded-md border bg-background px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}
    </div>
  )
}
