import { MODEL_LIMITS, ModelRecordSchema } from "@/domain/models/model"
import type { ModelId, ModelRecord } from "@/domain/models/model"
import { normalizeText } from "@/domain/primitives"
import { verifyModelEntry } from "./verify"
import type { ModelEntry } from "./verify"

/**
 * The Models library: uploaded CAD models, each stored once with its display mesh and, when
 * kept, its uploaded file. Adding verifies the entry; adding a stored model returns its record.
 * Adding over a record that exists but could not be read is refused rather than overwritten.
 */
export interface ModelStore {
  list: () => Promise<ModelRecord[]>
  mesh: (id: ModelId) => Promise<Uint8Array | null>
  source: (id: ModelId) => Promise<Uint8Array | null>
  add: (entry: ModelEntry) => Promise<ModelRecord>
  rename: (id: ModelId, name: string) => Promise<ModelRecord>
  remove: (id: ModelId) => Promise<void>
}

/** Where a library keeps each model's record and files: a folder per model in the app's data folder. */
export interface ModelBackend {
  /** Every stored record, unvalidated. */
  records: () => Promise<unknown[]>
  record: (id: ModelId) => Promise<unknown>
  writeRecord: (record: ModelRecord) => Promise<void>
  file: (id: ModelId, name: string) => Promise<Uint8Array | null>
  writeFile: (id: ModelId, name: string, bytes: Uint8Array) => Promise<void>
  remove: (id: ModelId) => Promise<void>
}

const MESH_FILE = "mesh.glb"
/** A GLB upload is its own mesh, so it is kept once, as the mesh. */
const sourceFile = (record: ModelRecord) => {
  if (!record.source) return null
  return record.source.sha256 === record.id
    ? MESH_FILE
    : `source.${record.source.format}`
}

const valid = (id: ModelId | null, value: unknown) => {
  const parsed = ModelRecordSchema.safeParse(value)
  return parsed.success && (id === null || parsed.data.id === id)
    ? parsed.data
    : null
}

/** Something is stored under `id`, but not a record `add` can trust as that id's. */
const isUnreadable = (id: ModelId, value: unknown) =>
  value !== null && value !== undefined && valid(id, value) === null

/**
 * The library's rules over any backend: entries are verified, a model is stored once (a model
 * that came with a project gains its file when uploaded again), the library is bounded, and
 * each record is written after its files, so an interrupted add leaves no entry. Changes run
 * one at a time.
 */
export class ModelLibrary implements ModelStore {
  private readonly backend: ModelBackend
  private queue: Promise<unknown> = Promise.resolve()

  constructor(backend: ModelBackend) {
    this.backend = backend
  }

  private enqueue<TResult>(work: () => Promise<TResult>): Promise<TResult> {
    const next = this.queue.then(work, work)
    this.queue = next.catch(() => undefined)
    return next
  }

  private async record(id: ModelId) {
    return valid(id, await this.backend.record(id))
  }

  /**
   * Every valid record, sorted by when it was added. A record present on disk but unreadable is
   * left out here too, but `add` refuses to replace it, so it is never silently lost.
   */
  async list(): Promise<ModelRecord[]> {
    return (await this.backend.records())
      .flatMap((value) => valid(null, value) ?? [])
      .sort((a, b) => a.addedAt - b.addedAt)
      .slice(0, MODEL_LIMITS.models)
  }

  async mesh(id: ModelId): Promise<Uint8Array | null> {
    return (await this.record(id)) ? this.backend.file(id, MESH_FILE) : null
  }

  async source(id: ModelId): Promise<Uint8Array | null> {
    const record = await this.record(id)
    const name = record && sourceFile(record)
    return name ? this.backend.file(id, name) : null
  }

  add(entry: ModelEntry): Promise<ModelRecord> {
    return this.enqueue(async () => {
      const { record, mesh, source } = await verifyModelEntry(entry)
      const name = sourceFile(record)
      const raw = await this.backend.record(record.id)
      if (isUnreadable(record.id, raw))
        throw new Error(
          "A model is already stored under this id but could not be read, so it was not replaced."
        )
      const stored = valid(record.id, raw)
      if (stored) {
        if (stored.source || !source || !name) return stored
        if (name !== MESH_FILE)
          await this.backend.writeFile(record.id, name, source)
        const upgraded = { ...stored, source: record.source }
        await this.backend.writeRecord(upgraded)
        return upgraded
      }
      if ((await this.list()).length >= MODEL_LIMITS.models)
        throw new Error(
          `The Models library holds at most ${MODEL_LIMITS.models} models. Remove some first.`
        )
      await this.backend.writeFile(record.id, MESH_FILE, mesh)
      if (source && name && name !== MESH_FILE)
        await this.backend.writeFile(record.id, name, source)
      await this.backend.writeRecord(record)
      return record
    })
  }

  rename(id: ModelId, name: string): Promise<ModelRecord> {
    return this.enqueue(async () => {
      const stored = await this.record(id)
      if (!stored) throw new Error("This model is no longer in the library.")
      const renamed = { ...stored, name: normalizeText(name) || stored.name }
      await this.backend.writeRecord(renamed)
      return renamed
    })
  }

  remove(id: ModelId): Promise<void> {
    return this.enqueue(() => this.backend.remove(id))
  }
}
