import { libraryOf, sameLibrary } from "@/domain/workspace/library"
import type { WorkspaceLibrary } from "@/domain/workspace/library"
import type { DocumentTarget } from "@/persistence/bind-document"
import type { WorkspaceStore } from "./store"

/**
 * The workspace's libraries as a stored document's target: restoring them replaces only the
 * libraries, and only a change to one of them is a change to save.
 */
export function libraryTarget(
  workspace: WorkspaceStore
): DocumentTarget<WorkspaceLibrary> {
  let current = libraryOf(workspace.state)
  // The same libraries keep the same object, so plate edits are not library changes.
  const read = () => {
    const next = libraryOf(workspace.state)
    if (!sameLibrary(next, current)) current = next
    return current
  }
  return {
    get state() {
      return read()
    },
    hydrate: (library) => {
      // Set first: the store notifies during the dispatch, and this is no change to save.
      current = library
      // What storage holds is not an edit to undo, and undoing an edit keeps it.
      workspace.dispatch(
        {
          type: "batch",
          commands: [
            {
              type: "library.tools",
              tools: library.tools,
              defaultToolId: library.defaultToolId,
            },
            {
              type: "library.stocks",
              stocks: library.stocks,
              defaultStockId: library.defaultStockId,
            },
          ],
        },
        { record: false }
      )
    },
    subscribe: (listener) => workspace.subscribe(() => listener(read())),
  }
}
