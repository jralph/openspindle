import { useRef, useState } from "react"
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { toast } from "sonner"
import type { ModelId, ModelRecord } from "@/domain/models/model"
import type { ModelStore } from "@/persistence/models/model-library"
import { useHost } from "@/platform/host-context"
import { importModel } from "./import-model"
import type { ImportStep } from "./import-model"

export const modelKeys = {
  library: ["models", "library"] as const,
  import: ["models", "import"] as const,
}

/** The Models library as the host holds it; every change below refreshes it. */
export const modelLibraryQuery = (store: ModelStore) =>
  queryOptions({
    queryKey: modelKeys.library,
    queryFn: () => store.list(),
    staleTime: Infinity,
  })

export function useModelLibrary() {
  return useQuery(modelLibraryQuery(useHost().models))
}

export type ImportProgress = { readonly fileName: string; step: ImportStep }
export type ImportOutcome = {
  readonly imported: readonly ModelRecord[]
  /** One line per file that could not be added. */
  readonly failures: readonly string[]
}

/**
 * Adds files to the library one after another, reporting which file is at which step. A
 * failed file is reported and the rest continue; `cancel` stops the running import.
 */
export function useImportModels() {
  const store = useHost().models
  const client = useQueryClient()
  const [progress, setProgress] = useState<ImportProgress | null>(null)
  const controller = useRef<AbortController | null>(null)
  const mutation = useMutation({
    mutationKey: modelKeys.import,
    mutationFn: async (files: readonly File[]): Promise<ImportOutcome> => {
      const abort = new AbortController()
      // A function, so narrowing never assumes a cancel that happened meanwhile impossible.
      const cancelled = () => abort.signal.aborted
      controller.current = abort
      const imported: ModelRecord[] = []
      const failures: string[] = []
      try {
        for (const file of files) {
          if (cancelled()) break
          try {
            const existing = await client.ensureQueryData(
              modelLibraryQuery(store)
            )
            const model = await importModel(file, {
              store,
              existing,
              signal: abort.signal,
              onStep: (step) => setProgress({ fileName: file.name, step }),
            })
            imported.push(model)
            await client.invalidateQueries({ queryKey: modelKeys.library })
          } catch (error) {
            if (cancelled()) break
            failures.push(
              `${file.name}: ${error instanceof Error ? error.message : "it could not be read."}`
            )
          }
        }
      } finally {
        controller.current = null
        setProgress(null)
      }
      return { imported, failures }
    },
  })
  return {
    ...mutation,
    progress,
    cancel: () => controller.current?.abort(),
  }
}

export function useRenameModel() {
  const store = useHost().models
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, name }: { id: ModelId; name: string }) =>
      store.rename(id, name),
    onSuccess: (renamed) =>
      client.setQueryData<ModelRecord[]>(modelKeys.library, (models) =>
        models?.map((model) => (model.id === renamed.id ? renamed : model))
      ),
    onError: (error) => toast.error(error.message),
  })
}

export function useRemoveModel() {
  const store = useHost().models
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: ModelId) => store.remove(id),
    onSuccess: () => client.invalidateQueries({ queryKey: modelKeys.library }),
    onError: (error) => toast.error(error.message),
  })
}
