import { useMemo } from "react"
import { useMachineSnapshot } from "@/platform/machine"
import { useJobSession } from "./job-session"
import { deriveJobView } from "./job-view"
import type { JobView } from "./job-view"

/** The Job tab's state: this window's Run session read against the machine snapshot. */
export function useJobView(): JobView {
  const session = useJobSession()
  const snapshot = useMachineSnapshot()
  return useMemo(() => deriveJobView(session, snapshot), [session, snapshot])
}
