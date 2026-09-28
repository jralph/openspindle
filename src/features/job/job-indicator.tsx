import { Link, useMatchRoute } from "@tanstack/react-router"
import { JobStatusBadge } from "./job-status-badge"
import { useJobView } from "./use-job-view"

/** The job's phase in the workspace header, linking to the Job tab; hidden without a job and on it. */
export function JobIndicator() {
  const view = useJobView()
  const onJobTab = useMatchRoute()({ to: "/job" })
  if (view.kind === "idle" || onJobTab) return null
  return (
    <JobStatusBadge
      view={view}
      render={<Link to="/job" title="Open the Job tab" />}
    />
  )
}
