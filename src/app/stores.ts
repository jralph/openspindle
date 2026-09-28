import { createStoreContext } from "@tanstack/react-store"
import type { FixtureLibraryStore } from "./fixtures/fixture-library-store"
import type { WorkspaceStore } from "./workspace/store"

/** The app's long-lived stores, created once at startup and shared with the React tree. */
export type AppStores = {
  readonly workspace: WorkspaceStore
  readonly fixtures: FixtureLibraryStore
}

export const {
  StoreProvider: AppStoresProvider,
  useStoreContext: useAppStores,
} = createStoreContext<AppStores>()
