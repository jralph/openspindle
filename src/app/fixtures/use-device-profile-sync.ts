import { useEffect, useEffectEvent } from "react"
import { machineId } from "@/machine/contract"
import { useDocumentState, usePersistence } from "@/persistence/persistence"
import { useMachineSnapshot } from "@/platform/machine"
import { followDeviceAnchors } from "../workspace/project-session"
import { useWorkspaceStore } from "../workspace/workspace-context"
import { useFixtureLibraryStore } from "./fixture-context"

/**
 * Follows the connected device: its fixture profile is created and selected, anchors read
 * from its configuration are recorded there, and plates set up for it follow them.
 * Runs once the fixture library is loaded, so nothing it records is replaced by hydration.
 */
export function useDeviceProfileSync() {
  const persistence = usePersistence()
  const fixtures = useFixtureLibraryStore()
  const workspace = useWorkspaceStore()
  const machine = useMachineSnapshot()
  const device = machine.connection.device
  const configuration = machine.anchors.value
  const fixturesState = useDocumentState(persistence.fixtures)
  const ready = fixturesState.phase !== "loading"
  const deviceKey = device ? machineId(device) : null

  const synchronize = useEffectEvent(() => {
    if (!device) return
    fixtures.adoptDevice(device)
    if (!configuration) return
    fixtures.recordDeviceAnchors(device, configuration)
    const id = machineId(device)
    const anchors = Object.hasOwn(fixtures.state.profiles, id)
      ? fixtures.state.profiles[id].anchors
      : undefined
    if (
      anchors?.source === "firmware-config" &&
      anchors.fetchedAt === configuration.fetchedAt
    )
      followDeviceAnchors(workspace, id, anchors)
  })

  useEffect(() => {
    if (ready) synchronize()
  }, [ready, deviceKey, configuration?.fetchedAt, fixturesState.generation])
}
