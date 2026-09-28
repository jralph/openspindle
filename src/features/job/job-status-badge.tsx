import type { ReactElement } from "react"
import {
  CircleCheck,
  CirclePause,
  Grid3X3,
  Square,
  TriangleAlert,
  Wrench,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Spinner } from "@/components/ui/spinner"
import { jobStatus } from "./job-view"
import type { ActiveJobView, JobOutcome } from "./job-view"

const OUTCOME_ICONS: Record<JobOutcome, LucideIcon> = {
  completed: CircleCheck,
  stopped: Square,
  failed: TriangleAlert,
  unverified: TriangleAlert,
  lost: TriangleAlert,
}

/** A spinner while the machine works on its own; an icon when it waits or has ended. */
function statusIcon(view: ActiveJobView): LucideIcon | null {
  switch (view.kind) {
    case "transferring":
    case "running":
    case "finishing":
      return null
    case "waiting-tool":
      return Wrench
    case "waiting-review":
      return Grid3X3
    case "paused-before-operation":
    case "paused-program":
    case "held":
      return CirclePause
    case "ended":
      return OUTCOME_ICONS[view.outcome]
  }
}

/** The job's phase as a badge; `render` turns it into a link. */
export function JobStatusBadge({
  view,
  render,
}: {
  view: ActiveJobView
  render?: ReactElement
}) {
  const status = jobStatus(view)
  const Icon = statusIcon(view)
  return (
    <Badge variant={status.tone} render={render} className="font-numeric">
      {Icon ? (
        <Icon data-icon="inline-start" />
      ) : (
        <Spinner data-icon="inline-start" aria-hidden />
      )}
      {status.label}
    </Badge>
  )
}
