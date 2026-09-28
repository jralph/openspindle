import { JobProgressDetails } from "./job-details"
import type { JobViewOf } from "./job-view"
import { StageCard } from "./stage-card"

type PauseView = JobViewOf<
  "paused-before-operation" | "paused-program" | "held"
>

function programPauseDescription(view: JobViewOf<"paused-program">): string {
  const line = view.point?.line ?? view.wait.line
  const where = line === null ? "" : ` at line ${line}`
  const within = view.operation ? ` in ${view.operation.name}` : ""
  return `The program stops itself here${where}${within}. Resume when ready.`
}

function pauseText(view: PauseView): { title: string; description: string } {
  switch (view.kind) {
    case "paused-before-operation":
      return {
        title: view.operation
          ? `Paused before ${view.operation.name}`
          : "Paused before the next operation",
        description:
          "The plate stops here before this operation. Check the setup, then resume.",
      }
    case "paused-program":
      return {
        title: "Program pause",
        description: programPauseDescription(view),
      }
    case "held":
      return {
        title: "Paused",
        description:
          "The machine holds the program. Resume continues from here.",
      }
  }
}

/** A pause that waits for the user: before an operation, the NC's own stop, or a hold. */
export function PausePrompt({ view }: { view: PauseView }) {
  const { title, description } = pauseText(view)
  return (
    <StageCard title={title} description={description}>
      <JobProgressDetails job={view.job} subject={view.session} />
    </StageCard>
  )
}
