import { useSelector } from "@tanstack/react-store"
import { profileDeviceId } from "@/domain/fixtures/profiles"
import type { FixtureLibrary } from "@/persistence/fixture-document"
import { useAppStores } from "../stores"
import { selectedProfile } from "./fixture-library-store"
import type { FixtureLibraryStore } from "./fixture-library-store"

export const useFixtureLibraryStore = (): FixtureLibraryStore =>
  useAppStores().fixtures

export function useFixtureLibrary<TSelected>(
  selector: (library: FixtureLibrary) => TSelected
): TSelected {
  return useSelector(useFixtureLibraryStore().store, selector)
}

/** The selected profile and the device it belongs to (null for workspace defaults). */
export function useSelectedFixtureProfile() {
  const profile = useFixtureLibrary(selectedProfile)
  const deviceId = useFixtureLibrary((library) =>
    profileDeviceId(library.selectedId)
  )
  return { profile, deviceId }
}
