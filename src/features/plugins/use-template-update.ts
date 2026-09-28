import { useMutation } from "@tanstack/react-query"
import type { ProcessParameterValues } from "@openspindle/plugin-core"
import { toast } from "sonner"
import { templateSource } from "@/app/workspace/templates"
import { useWorkspaceStore } from "@/app/workspace/workspace-context"
import type { OperationOf } from "@/domain/operations/kinds"
import type { PluginSummary } from "@/platform/contract/plugin-rpc"
import { useHost } from "@/platform/host-context"

export type TemplateUpdate = {
  readonly plateId: string
  /** The operation as it was shown; a change since then refuses the update. */
  readonly operation: OperationOf<"template">
  readonly plugin: PluginSummary
  readonly values: ProcessParameterValues
}

/** Regenerates a template operation with its installed plugin and replaces its source. */
export function useTemplateUpdate() {
  const plugins = useHost().plugins
  const workspace = useWorkspaceStore()
  return useMutation({
    mutationFn: async ({
      plateId,
      operation,
      plugin,
      values,
    }: TemplateUpdate) => {
      const source = await templateSource(
        plugins.renderProgram,
        plugin,
        operation.source.programId,
        values
      )
      if (!source.ok) throw new Error(source.error)
      const result = workspace.dispatch({
        type: "operation.source",
        plateId,
        operationId: operation.id,
        source: source.value,
        expectedRevision: operation.revision,
      })
      if (!result.ok) throw new Error(result.error)
    },
    onError: (error) => toast.error(error.message),
  })
}
