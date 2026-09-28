import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"
import { JobPage } from "@/features/job/job-page"

const JobSearchSchema = z.object({
  /** A program line to show once (a deep link); removed from the URL when shown. */
  line: z.int().positive().optional().catch(undefined),
})
export type JobSearch = z.infer<typeof JobSearchSchema>

export const Route = createFileRoute("/_workspace/job")({
  validateSearch: JobSearchSchema,
  component: JobRoute,
})

function JobRoute() {
  const { line } = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <JobPage
      requestedLine={line ?? null}
      onRequestedLineShown={() =>
        void navigate({
          search: (previous) => ({ ...previous, line: undefined }),
          replace: true,
        })
      }
    />
  )
}
