import { Layers3 } from "lucide-react"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { useSelectedPlate } from "@/app/workspace/workspace-context"
import type { Operation } from "@/domain/operations/operation"
import { MissingPluginsBanner } from "@/features/plugins/missing-plugins-banner"
import { usePrepareSelection } from "../plate-tree/use-prepare-selection"
import { OperationInspector } from "./operation-inspector"
import { PlateInspector } from "./plate-inspector"

/**
 * Operations of one plugin share an inspector, so its editor frame stays mounted and follows
 * the selection (the view gets the new operation in its context): work in progress, such as
 * a generation started just before switching, is finished instead of discarded.
 */
const inspectorKey = (operation: Operation) =>
  operation.source.kind === "plugin"
    ? `plugin:${operation.source.pluginId}`
    : operation.id

/** Settings of what is selected in the tree: an operation, or else its plate. */
export function PrepareInspector() {
  const plate = useSelectedPlate()
  const selection = usePrepareSelection()
  if (!plate)
    return (
      <Empty className="border-t">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Layers3 />
          </EmptyMedia>
          <EmptyTitle>No plate</EmptyTitle>
          <EmptyDescription>
            Import an NC program to start a plate.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  const operation = plate.operations.find(
    (item) => item.id === selection.operationId
  )
  return (
    <>
      <MissingPluginsBanner plate={plate} />
      {operation ? (
        <OperationInspector
          key={inspectorKey(operation)}
          plate={plate}
          operation={operation}
          panel={selection.panel}
          onPanel={selection.showPanel}
        />
      ) : (
        <PlateInspector
          plate={plate}
          panel={selection.panel}
          onPanel={selection.showPanel}
        />
      )}
    </>
  )
}
