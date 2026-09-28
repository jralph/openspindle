import { TOOL_COUNT_LIMIT } from "@/domain/tools/tool"
import type { WorkspaceState } from "./workspace"

/**
 * The tool and stock libraries with their defaults. The app keeps them between launches; a
 * saved project carries a copy for other computers.
 */
export type WorkspaceLibrary = Pick<
  WorkspaceState,
  "tools" | "stocks" | "defaultToolId" | "defaultStockId"
>

export const libraryOf = (state: WorkspaceState): WorkspaceLibrary => ({
  tools: state.tools,
  stocks: state.stocks,
  defaultToolId: state.defaultToolId,
  defaultStockId: state.defaultStockId,
})

export const sameLibrary = (a: WorkspaceLibrary, b: WorkspaceLibrary) =>
  a.tools === b.tools &&
  a.stocks === b.stocks &&
  a.defaultToolId === b.defaultToolId &&
  a.defaultStockId === b.defaultStockId

/**
 * An opened project on the app's libraries. Its plates refer to library tools by id, so the
 * tools they use that the library lacks are added; a tool the library has stays as it is. The
 * project's other tools and its stock presets are not taken: plates carry their own stock.
 */
export function openInLibrary(
  opened: WorkspaceState,
  library: WorkspaceLibrary
): { readonly state: WorkspaceState; readonly added: number } {
  const known = new Set(library.tools.map((tool) => tool.id))
  const used = new Set(
    opened.plates.flatMap((plate) =>
      plate.tools.flatMap((entry) => (entry.toolId ? [entry.toolId] : []))
    )
  )
  const room = Math.max(0, TOOL_COUNT_LIMIT - library.tools.length)
  const added = opened.tools
    .filter((tool) => used.has(tool.id) && !known.has(tool.id))
    .slice(0, room)
  return {
    state: {
      ...opened,
      ...library,
      tools: added.length ? [...library.tools, ...added] : library.tools,
    },
    added: added.length,
  }
}
