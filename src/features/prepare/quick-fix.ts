import { toast } from "sonner"
import { useWorkspaceStore } from "@/app/workspace/workspace-context"
import type { QuickFix } from "@/domain/diagnostics"
import type { Plate } from "@/domain/plate/plate"
import { useTemplateUpdate } from "@/features/plugins/use-template-update"
import { openDialog } from "@/features/shell/dialogs"
import { useMachineSnapshot, useReadAnchors } from "@/platform/machine"
import { useInstalledPlugins } from "@/platform/plugins"
import { usePrepareSelection } from "./plate-tree/use-prepare-selection"

export const QUICK_FIX_LABELS: Record<QuickFix["kind"], string> = {
  "assign-tool": "Assign tool",
  "update-operation": "Update",
  "install-plugin": "Manage plugins",
  "read-anchors": "Read anchors",
  "edit-operation": "Edit",
}

/** Regenerates a template operation from its saved values with the installed plugin version. */
function useUpdateOperation() {
  const workspace = useWorkspaceStore()
  const plugins = useInstalledPlugins().data ?? []
  const update = useTemplateUpdate()
  return (plateId: string, operationId: string) => {
    const operation = workspace.state.plates
      .find((plate) => plate.id === plateId)
      ?.operations.find((item) => item.id === operationId)
    if (operation?.source.kind !== "template") return
    const source = operation.source
    const plugin = plugins.find((item) => item.id === source.pluginId)
    if (!plugin?.enabled) {
      toast.error(`Enable ${source.pluginId} to update "${operation.name}".`)
      return
    }
    update.mutate({
      plateId,
      operation: { ...operation, source },
      plugin,
      values: source.values,
    })
  }
}

/**
 * The read-anchors fix as a machine action, gated by availability like the Job checklist and
 * the Device tab's Read anchors button, so a double click cannot send two reads.
 */
export function useReadAnchorsFix() {
  const { availability } = useMachineSnapshot()
  const readAnchors = useReadAnchors()
  const entry = availability.readAnchors
  return {
    reason: entry.allowed ? null : (entry.reason ?? "Unavailable."),
    pending: readAnchors.isPending,
    run: () =>
      readAnchors.mutate(undefined, {
        onSuccess: () => toast.success("Stored anchors updated."),
        onError: (error) => toast.error(error.message),
      }),
  }
}

/** Carries out the fix a diagnostic offers, other than reading anchors (`useReadAnchorsFix`). */
export function useQuickFix() {
  const selection = usePrepareSelection()
  const update = useUpdateOperation()
  return (plate: Plate, fix: QuickFix) => {
    switch (fix.kind) {
      case "assign-tool":
        openDialog({
          kind: "tools",
          assign: { plateId: plate.id, number: fix.toolNumber },
        })
        return
      case "update-operation":
        update(plate.id, fix.operationId)
        return
      case "install-plugin":
        openDialog({ kind: "plugins" })
        return
      case "read-anchors":
        // DiagnosticsList renders this fix through useReadAnchorsFix instead.
        return
      case "edit-operation":
        selection.selectOperation(plate.id, fix.operationId)
    }
  }
}
