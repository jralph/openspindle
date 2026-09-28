import { queryOptions } from "@tanstack/react-query"
import type { DiagnosticsHost } from "./host"

export const diagnosticsKeys = {
  status: ["diagnostics", "status"] as const,
}

/** The log and report settings, whether the build reports errors, and the app's versions. */
export const diagnosticsStatusQuery = (diagnostics: DiagnosticsHost) =>
  queryOptions({
    queryKey: diagnosticsKeys.status,
    queryFn: () => diagnostics.status(),
    staleTime: Infinity,
  })
