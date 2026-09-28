import { FieldDescription } from "@/components/ui/field"
import { ToolCard } from "@/components/workspace/tool-card"
import { useWorkspace } from "@/app/workspace/workspace-context"
import type { Operation } from "@/domain/operations/operation"
import type { Plate } from "@/domain/plate/plate"
import { openDialog } from "@/features/shell/dialogs"
import { toolNumberLabel } from "./plate-tools-panel"

/** The operation's own tool numbers and the plate's table entries they use. */
export function OperationToolsPanel({
  plate,
  operation,
}: {
  plate: Plate
  operation: Operation
}) {
  const library = useWorkspace((state) => state.tools)
  if (!operation.tools.length)
    return (
      <FieldDescription className="p-4">
        This operation selects no tools yet.
      </FieldDescription>
    )
  return (
    <div className="flex flex-col gap-3 p-3" aria-label="Operation tools">
      {operation.tools.map((binding) => {
        const entry = plate.tools.find((tool) => tool.number === binding.plate)
        const tool = library.find((item) => item.id === entry?.toolId)
        const shared = plate.operations.filter(
          (item) =>
            item.id !== operation.id &&
            item.tools.some((other) => other.plate === binding.plate)
        ).length
        const renumbered = binding.local !== binding.plate
        return (
          <div key={binding.local ?? "program"} className="flex flex-col gap-1">
            <ToolCard
              tool={tool}
              slotLabel={toolNumberLabel(binding.plate)}
              emptyLabel={
                entry?.toolId ? "Missing from the library" : "Assign tool"
              }
              onClick={() =>
                openDialog({
                  kind: "tools",
                  assign: { plateId: plate.id, number: binding.plate },
                })
              }
            />
            {(renumbered || shared > 0) && (
              <FieldDescription>
                {renumbered &&
                  `The program's ${toolNumberLabel(binding.local)} runs as ${toolNumberLabel(binding.plate)}. `}
                {shared > 0 &&
                  `Shared with ${shared} other operation${shared === 1 ? "" : "s"}.`}
              </FieldDescription>
            )}
          </div>
        )
      })}
    </div>
  )
}
