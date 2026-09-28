import type { QueryClient } from "@tanstack/react-query"
import type { WorkspaceState } from "@/domain/workspace/workspace"
import { projectDocument } from "@/formats/project/document"
import { referencedPlugins } from "@/formats/project/plugin-reference"
import { encodeProject } from "@/formats/project/project"
import type { Host } from "@/platform/host"
import { installedPluginsQuery } from "@/platform/plugins"
import { projectModels } from "./project-models"

/**
 * The workspace as the contents of a STEP-NC project file, as Save Project writes it, with
 * the plugins it refers to and how many of its fixtures' models it lacks.
 */
export async function encodeWorkspace(
  state: WorkspaceState,
  host: Host,
  queryClient: QueryClient
) {
  const installed = await queryClient.ensureQueryData(
    installedPluginsQuery(host.plugins)
  )
  const references = referencedPlugins(
    state.plates,
    installed,
    state.project.plugins
  )
  const { models, missing } = await projectModels(state.plates, host.models)
  const contents = encodeProject(projectDocument(state, references, models))
  return { contents, references, missing }
}
