import { createAtom, useSelector } from "@tanstack/react-store"
import type { RowSelectionState } from "@tanstack/react-table"
import type { CompiledPlate, CompiledSection } from "@/domain/compile/compile"
import type { Plate } from "@/domain/plate/plate"

/** Tree row id of a program section; sections are selected per plate. */
export const sectionRowId = (plateId: string, sectionId: string) =>
  `section:${plateId}:${sectionId}`

/** Program sections selected in the plate tree (by row id): grouped, and highlighted in the viewer. */
export const sectionSelectionAtom = createAtom<RowSelectionState>({})

export const useSectionSelection = () => useSelector(sectionSelectionAtom)
export const selectSections = (rowIds: readonly string[]) =>
  sectionSelectionAtom.set(() =>
    Object.fromEntries(rowIds.map((id) => [id, true] as const))
  )
export const clearSectionSelection = () => sectionSelectionAtom.set(() => ({}))

export function selectedSections(
  plate: Plate,
  compiled: CompiledPlate,
  selection: Readonly<RowSelectionState>
): CompiledSection[] {
  return compiled.sections.filter((section) =>
    Object.hasOwn(selection, sectionRowId(plate.id, section.id))
  )
}
