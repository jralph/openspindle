import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type {
  ArrangeDrag,
  ArrangePick,
} from "@/components/workspace/bed-viewer"
import { MOVE_AXES_LABELS } from "@/domain/plate/setup-items"
import type { SetupItem } from "@/domain/plate/setup-items"
import { toMicrometre } from "@/domain/primitives"
import { useArrange, useArrangeDrag } from "./arrange-state"
import type { ArrangeState, ArrangeTarget } from "./arrange-state"

const signed = (value: number) => {
  const rounded = toMicrometre(value)
  return rounded > 0 ? `+${rounded}` : String(rounded)
}

/** How far a drag has gone: the axes it moves along, and what it snapped to. */
function dragText({ delta, snappedTo }: ArrangeDrag) {
  const moved = (["X", "Y", "Z"] as const)
    .map((axis, index) => `${axis} ${signed(delta[index])}`)
    .join(", ")
  return snappedTo ? `${moved} mm, on ${snappedTo}` : `${moved} mm`
}

function hintText(
  item: SetupItem,
  state: ArrangeState,
  pick: ArrangePick,
  drag: ArrangeDrag | null
) {
  if (item.fixed) return item.fixed
  if (!state.moving) return "Move it with the move tool (M)."
  if (drag) return <span className="font-numeric">{dragText(drag)}</span>
  if (pick.from) return `Click the point to move ${pick.from.label} to.`
  if (pick.notice === "pick-own-point")
    return `First click a point of ${item.name}, then the point to align it to.`
  const along = MOVE_AXES_LABELS[state.axes]
  const snapping = state.snap ? ", snapping to points (hold Alt not to)" : ""
  return `Drag it along ${along}${snapping}, or click one of its points and then another. Right-click for options.`
}

/** What is selected in the viewer, and what clicking and dragging will do with it. */
export function ArrangeHint({
  target,
  pick,
}: {
  target: ArrangeTarget | null
  pick: ArrangePick
}) {
  const state = useArrange()
  const drag = useArrangeDrag()
  if (!target) return null
  return (
    <Card
      size="sm"
      className="pointer-events-none absolute bottom-4 left-1/2 z-10 w-md max-w-[calc(100%-140px)] -translate-x-1/2"
      aria-live="polite"
    >
      <CardHeader>
        <CardTitle>{target.item.name}</CardTitle>
        <CardDescription>
          {hintText(target.item, state, pick, drag)}
        </CardDescription>
      </CardHeader>
    </Card>
  )
}
