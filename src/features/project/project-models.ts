import { projectModelIds } from "@/formats/project/document"
import type { ProjectModel } from "@/formats/project/document"
import { fromBase64, toBase64 } from "@/formats/base64-json"
import type { Plate } from "@/domain/plate/plate"
import type { ModelStore } from "@/persistence/models/model-library"

/**
 * The models a saved project embeds: those its plates' fixtures use that the library holds,
 * with their meshes but not their uploaded files. `missing` counts the ones it does not hold.
 */
export async function projectModels(
  plates: readonly Plate[],
  store: ModelStore
): Promise<{ models: ProjectModel[]; missing: number }> {
  const ids = projectModelIds(plates)
  if (!ids.length) return { models: [], missing: 0 }
  const records = new Map(
    (await store.list()).map((model) => [model.id, model])
  )
  const models: ProjectModel[] = []
  for (const id of ids) {
    const record = records.get(id)
    const mesh = record ? await store.mesh(id) : null
    if (record && mesh)
      models.push({ record: { ...record, source: null }, mesh: toBase64(mesh) })
  }
  return { models, missing: ids.length - models.length }
}

/**
 * Adds an opened project's models to the library (a model it already holds stays as it is).
 * Returns a notice for each model that fails its checks; its fixtures show as boxes.
 */
export async function addProjectModels(
  models: readonly ProjectModel[],
  store: ModelStore
): Promise<string[]> {
  const notices: string[] = []
  for (const model of models) {
    try {
      await store.add({
        record: { ...model.record, addedAt: Date.now() },
        mesh: fromBase64(model.mesh),
        source: null,
      })
    } catch (error) {
      const reason = error instanceof Error ? error.message : "it is invalid"
      notices.push(
        `The model "${model.record.name}" was not added to your Models library (${reason}); its fixtures show as boxes.`
      )
    }
  }
  return notices
}
