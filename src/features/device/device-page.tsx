import { toast } from "sonner"
import {
  useFixtureLibrary,
  useFixtureLibraryStore,
  useSelectedFixtureProfile,
} from "@/app/fixtures/fixture-context"
import { followDeviceAnchors } from "@/app/workspace/project-session"
import { useWorkspaceStore } from "@/app/workspace/workspace-context"
import { openDialog } from "@/features/shell/dialogs"
import { useMachineSnapshot, useReadAnchors } from "@/platform/machine"
import { DeviceAnchors } from "./device-anchors"
import { DeviceFixtures } from "./device-fixtures"
import { DevicePanel } from "./device-panel"
import { HeightMapCard } from "./height-map"
import { useDeviceHeightMap } from "./height-map-dialog"
import { ReadAnchorsButton } from "./read-anchors-button"

/**
 * The machine: connection, controls, camera, anchors, fixtures and the measured height map.
 * Anchors are read on connecting; reading them again happens here.
 */
export function DevicePage() {
  const machine = useMachineSnapshot()
  const readAnchors = useReadAnchors()
  const fixtures = useFixtureLibraryStore()
  const profiles = useFixtureLibrary((library) => library.profiles)
  const selectedId = useFixtureLibrary((library) => library.selectedId)
  const { profile, deviceId } = useSelectedFixtureProfile()
  const workspace = useWorkspaceStore()
  const { map } = useDeviceHeightMap()
  // A connected machine that stores no anchors has none to read; its kit may still place some.
  const storesAnchors = machine.features?.anchors !== false
  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <DevicePanel
        openPicker={() => openDialog({ kind: "device" })}
        fixturePanel={
          <>
            <HeightMapCard
              map={map}
              onOpen={() => openDialog({ kind: "height-map" })}
            />
            <DeviceAnchors
              setup={profile.anchors}
              loading={machine.anchors.reading}
              error={machine.anchors.error ?? undefined}
              action={
                storesAnchors && (
                  <ReadAnchorsButton
                    reading={readAnchors.isPending}
                    onRead={() =>
                      readAnchors.mutate(undefined, {
                        onSuccess: () =>
                          toast.success("Stored anchors updated."),
                        onError: (error) => toast.error(error.message),
                      })
                    }
                  />
                )
              }
              onAlign={(anchor1BedPosition) => {
                if (!profile.anchors) return
                const anchors = { ...profile.anchors, anchor1BedPosition }
                fixtures.setAnchors(anchors)
                followDeviceAnchors(workspace, deviceId, anchors)
              }}
            />
            <DeviceFixtures
              definitions={profile.definitions}
              onChange={(definitions) => fixtures.setDefinitions(definitions)}
              profiles={profiles}
              selectedId={selectedId}
              onProfileChange={(id) => fixtures.select(id)}
            />
          </>
        }
      />
    </div>
  )
}
