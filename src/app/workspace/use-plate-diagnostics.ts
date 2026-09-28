import { useMemo } from "react"
import { plateDiagnostics } from "@/app/workspace/diagnostics"
import { useWorkspace } from "@/app/workspace/workspace-context"
import type { Diagnostic } from "@/domain/diagnostics"
import type { Plate } from "@/domain/plate/plate"
import { useInstalledPlugins } from "@/platform/plugins"

const NONE: readonly Diagnostic[] = []

/** Everything that blocks or qualifies Run for a plate (none without a plate). */
export function usePlateDiagnostics(
  plate: Plate | null
): readonly Diagnostic[] {
  const tools = useWorkspace((state) => state.tools)
  const plugins = useInstalledPlugins().data ?? null
  return useMemo(
    () => (plate ? plateDiagnostics(plate, { tools, plugins }) : NONE),
    [plate, tools, plugins]
  )
}
