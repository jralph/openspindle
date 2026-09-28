import { toast } from "sonner"
import { replacementPlate } from "@/app/workspace/defaults"
import type { TransferableOperation } from "@/app/workspace/import-files"
import { newPlate } from "@/app/workspace/import-program"
import {
  selectedPlate,
  useWorkspaceStore,
} from "@/app/workspace/workspace-context"
import type { Plate } from "@/domain/plate/plate"
import type { WorkspaceCommand } from "@/domain/workspace/workspace"
import { useImportContext } from "@/features/shell/use-import"
import { usePrepareSelection } from "../plate-tree/use-prepare-selection"

/**
 * Adds a generated operation: to the selected plate, or to a new plate when there is none
 * (or only the empty plate, set up as that was). An operation fitted to its plate is made
 * for the plate it goes to. The operation is selected so its settings show.
 */
export function useAddOperation() {
  const workspace = useWorkspaceStore()
  const context = useImportContext()
  const selection = usePrepareSelection()
  return (
    adding: TransferableOperation | ((plate: Plate) => TransferableOperation)
  ): boolean => {
    const selected = selectedPlate(workspace.state)
    const plate = selected?.example
      ? replacementPlate(selected, context())
      : (selected ?? newPlate(context()))
    const added = typeof adding === "function" ? adding(plate) : adding
    const add: WorkspaceCommand = {
      type: "operation.add",
      plateId: plate.id,
      operation: added.operation,
      preferredTools: added.preferredTools,
    }
    const result = workspace.dispatch(
      plate === selected
        ? add
        : {
            type: "batch",
            commands: [
              { type: "plates.add", plates: [plate], select: true },
              add,
            ],
          }
    )
    if (!result.ok) {
      toast.error(result.error)
      return false
    }
    selection.selectOperation(plate.id, added.operation.id)
    return true
  }
}
