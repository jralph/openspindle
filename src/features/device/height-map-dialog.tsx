import { machineId } from "@/machine/contract"
import {
  useWorkspace,
  useWorkspaceStore,
} from "@/app/workspace/workspace-context"
import { HeightMapView } from "./height-map"
import { AppDialog } from "@/features/shell/app-dialog"
import { useMachineSnapshot, useReadHeightMap } from "@/platform/machine"

/** The height map of the connected device (or the selected plate's), and reading it again. */
export function useDeviceHeightMap() {
  const machine = useMachineSnapshot()
  const device = machine.connection.device
  const deviceId = useWorkspace((state) => {
    if (device) return machineId(device)
    const plate = state.plates.find((item) => item.id === state.selectedPlateId)
    return plate?.setup.deviceId ?? null
  })
  const map = useWorkspace((state) =>
    deviceId !== null && Object.hasOwn(state.heightMaps, deviceId)
      ? state.heightMaps[deviceId]
      : undefined
  )
  return { map, deviceId }
}

export function HeightMapDialog({ onClose }: { onClose: () => void }) {
  const workspace = useWorkspaceStore()
  const machine = useMachineSnapshot()
  const read = useReadHeightMap()
  const { map, deviceId } = useDeviceHeightMap()
  const availability = machine.availability.readHeightMap
  return (
    <AppDialog title="Measured heights" width="wide" onClose={onClose}>
      <HeightMapView
        key={deviceId ?? "disconnected"}
        map={map}
        deviceName={machine.connection.device?.name}
        readError={availability.allowed ? null : availability.reason}
        deferred={availability.deferred}
        reading={read.isPending}
        onRetrieve={async () => {
          const result = await read.mutateAsync()
          workspace.dispatch({ type: "heightMap.store", map: result })
        }}
      />
    </AppDialog>
  )
}
