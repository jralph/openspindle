import { Store, useSelector } from "@tanstack/react-store"
import type { CompiledPlate } from "@/domain/compile/compile"
import type { Plate } from "@/domain/plate/plate"
import type { Tool } from "@/domain/tools/tool"

/**
 * One Run, frozen when it is sent: the plate as it was (plates are immutable values, so the
 * reference is the snapshot), its compiled program and the library tools its tool table
 * referenced. The Job tab explains a job through its session, never through the live
 * workspace, so editing the plate during a job cannot change what the job view shows.
 */
export type JobSession = {
  /** The RunRequest id, which the machine reports back as the job id. */
  readonly runId: string
  readonly plate: Plate
  /** How the plate showed at Run: its name, or its number then. */
  readonly label: string
  readonly compiled: CompiledPlate
  readonly tools: readonly Tool[]
  /** Pauses (by `pauseKey`) whose one automatic height-map read has started. */
  readonly reviewedPauses: readonly string[]
}

export function createJobSession(
  plate: Plate,
  label: string,
  compiled: CompiledPlate,
  library: readonly Tool[]
): JobSession {
  const referenced = new Set(plate.tools.map((entry) => entry.toolId))
  return {
    runId: crypto.randomUUID(),
    plate,
    label,
    compiled,
    tools: library.filter((tool) => referenced.has(tool.id)),
    reviewedPauses: [],
  }
}

type JobSessionActions = {
  /** A new Run supersedes any earlier session. */
  begin: (session: JobSession) => void
  /** Dismiss: the Job tab returns to the selected plate. */
  clear: () => void
  /** Claims a pause's one automatic height-map read; false when already claimed. */
  claimReview: (runId: string, pauseKey: string) => boolean
}

/** The Run this window started. It outlives route changes and ends only on Dismiss. */
export const jobSessionStore = new Store<JobSession | null, JobSessionActions>(
  null,
  ({ get, setState }) => ({
    begin: (session) => setState(() => session),
    clear: () => setState(() => null),
    claimReview: (runId, pauseKey) => {
      const session = get()
      if (session?.runId !== runId || session.reviewedPauses.includes(pauseKey))
        return false
      setState(() => ({
        ...session,
        reviewedPauses: [...session.reviewedPauses, pauseKey],
      }))
      return true
    },
  })
)

export const useJobSession = () => useSelector(jobSessionStore)
